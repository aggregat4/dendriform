import { el, text } from 'redom'
import {
  Command,
  MergeNodesByIdCommandPayload,
  RelativeLinearPosition,
  RenameNodeByIdCommandPayload,
  ReparentNodesByIdCommandPayload,
  RepositoryNode,
  ResolvedRepositoryNode,
  SplitNodeByIdCommandPayload,
  UnmergeNodesByIdCommandPayload,
  UnsplitNodeByIdCommandPayload,
  createNewResolvedRepositoryNode,
  Filter,
  Highlight,
  getRequestedNodeId} from './tree-api'
import {
  getNodeId,
  getParentNode,
  hasChildren,
  getNameElement,
  getChildrenElement,
  getChildrenElementOrCreate} from './tree-dom-util'

export class TreeNode {
  private el
  private anchorEl
  private nameEl
  private collapseEl
  private nameHits: Highlight[]
  // Future extension: allow descriptions to be searched
  // private descHits: FilterHits
  private includedInFilter: boolean = false

  // 1. check for own filterhits
  // 2. process all children
  // 3. if filter then generate a list of all includedInFilter children
  // 3. if self included inFilter or ANY children included in filter: then includedInFilter = true
  // 4. if (filter and includedInFilter): render node and those children that are included
  // 5. if not filter: render node and all children
  constructor(treeNode: ResolvedRepositoryNode, first: boolean, filter?: Filter) {
    // Process all the children
    let children = treeNode.children && treeNode.children.length > 0 ?
      treeNode.children.map(c => new TreeNode(c, false, filter)) : []
    if (filter) {
      // only include children that also are in the filter
      children = children.filter(c => c.isIncludedInFilter())
      // Check for own filterHits
      this.nameHits = []
      let pos = 0 - filter.query.length
      const lowerCaseName = treeNode.node.name.toLowerCase()
      while ((pos = lowerCaseName.indexOf(filter.query, pos + filter.query.length)) > -1) {
        this.nameHits.push({pos, length: filter.query.length})
      }
      // When there are filtered children or we have a hit, then we should be included
      if (children.length > 0 || this.nameHits.length > 0) {
        this.includedInFilter = true
      }
    }
    if (!filter || this.includedInFilter) {
      this.generateDom(treeNode, first, children)
    }
  }

  // TODO: smaller class names to save bytes?
  private generateDom(treeNode: ResolvedRepositoryNode, first: boolean, children: TreeNode[]) {
    this.el = el(
      'div',
      {
        id: treeNode.node._id,
        class: this.genClass(treeNode, first),
      },
      el('div.nc',
        this.anchorEl = el('a', { href: `#node=${treeNode.node._id}` }, '•'), // &#8226;
        this.nameEl = el('div.name', { contentEditable: true }, this.highlightName(treeNode.node.name)),
        (children && children.length > 0) ?
          this.collapseEl = el(`span.toggle${treeNode.node.collapsed ? '.closed' : '.open'}`) :
          undefined,
      ),
      el('div.children', children))
  }

  isIncludedInFilter(): boolean {
    return this.includedInFilter
  }

  getElement(): Element {
    return this.el
  }

  private highlightName(name: string): Element[] {
    // Only attempt to mark up search hits when we are included in the filter
    // and we actually have any hits ourselves (could be only our children have hits)
    if (this.isIncludedInFilter() && this.nameHits.length > 0) {
      const segments = []
      let pos = 0
      // tslint:disable-next-line:prefer-for-of
      for (let i = 0; i < this.nameHits.length; i++) {
        const hit = this.nameHits[i]
        if (pos !== hit.pos) {
          segments.push(text(name.slice(pos, hit.pos)))
        }
        pos = hit.pos + hit.length
        segments.push(el('mark', name.slice(hit.pos, pos)))
      }
      if (pos < name.length) {
        segments.push(text(name.slice(pos, name.length)))
      }
      return segments
    } else {
      return [text(name)]
    }
  }

  private isRoot(node: RepositoryNode): boolean {
    return node._id === 'ROOT'
  }

  private genClass(node: ResolvedRepositoryNode, isFirst: boolean): string {
    return 'node' + (this.isRoot(node.node) ? ' root' : '') + (isFirst ? ' first' : '')
  }

  static exec(command: Command) {
    // TODO: consider moving this to the exec function, then redo is also handled
    // I have not done this here since we currently optimise the actual initial
    // dom operations by using the DOM elements directly, no need to getElementById them all...
    if (command.payload instanceof SplitNodeByIdCommandPayload) {
      const splitCommand = command.payload as SplitNodeByIdCommandPayload
      TreeNode.domSplitNode(
        document.getElementById(splitCommand.nodeId),
        splitCommand.newNodeName,
        splitCommand.remainingNodeName,
        splitCommand.siblingId)
    } else if (command.payload instanceof UnsplitNodeByIdCommandPayload) {
      const unsplitCommand = command.payload as UnsplitNodeByIdCommandPayload
      TreeNode.domUnsplitNode(
        document.getElementById(unsplitCommand.originalNodeId),
        document.getElementById(unsplitCommand.newNodeId),
        unsplitCommand.originalName)
    } else if (command.payload instanceof MergeNodesByIdCommandPayload) {
      const mergeNodesCommand = command.payload as MergeNodesByIdCommandPayload
      TreeNode.domMergeNodes(
        document.getElementById(mergeNodesCommand.sourceNodeId),
        mergeNodesCommand.sourceNodeName,
        document.getElementById(mergeNodesCommand.targetNodeId),
        mergeNodesCommand.targetNodeName)
    } else if (command.payload instanceof UnmergeNodesByIdCommandPayload) {
      const unmergeCommand = command.payload as UnmergeNodesByIdCommandPayload
      TreeNode.domUnmergeNode(
        document.getElementById(unmergeCommand.sourceNodeId),
        unmergeCommand.sourceNodeName,
        unmergeCommand.targetNodeId,
        unmergeCommand.targetNodeName)
    } else if (command.payload instanceof RenameNodeByIdCommandPayload) {
      const renameCommand = command.payload as RenameNodeByIdCommandPayload
      TreeNode.domRenameNode(document.getElementById(renameCommand.nodeId), renameCommand.newName)
    } else if (command.payload instanceof ReparentNodesByIdCommandPayload) {
      const reparentCommand = command.payload as ReparentNodesByIdCommandPayload
      const relativeNode = reparentCommand.position.nodeId ?
        document.getElementById(reparentCommand.position.nodeId) : null
      TreeNode.domReparentNode(
        document.getElementById(reparentCommand.nodeId),
        document.getElementById(reparentCommand.newParentNodeId),
        relativeNode,
        reparentCommand.position.beforeOrAfter)
    }
  }

  static domMergeNodes(sourceNode: Element, sourceNodeName: string,
                       targetNode: Element, targetNodeName: string): void {
    // DOM Handling
    // 1. rename targetnode to be targetnode.name + sourcenode.name
    // 2. move all children of sourcenode to targetnode (actual move, just reparent)
    // 3. delete sourcenode
    // 4. focus the new node at the end of its old name
    getNameElement(targetNode).textContent = targetNodeName + sourceNodeName
    // Only move source node children if it has any
    // TODO: make this childnodestuff safer with some utility methods
    if (hasChildren(sourceNode)) {
      const targetChildrenNode = getChildrenElementOrCreate(targetNode)
      const sourceChildrenNode = getChildrenElement(sourceNode)
      sourceChildrenNode.childNodes.forEach((childNode, currentIndex, listObj) => {
        targetChildrenNode.appendChild(childNode)
      })
    }
    sourceNode.remove()
  }

  static domUnmergeNode(mergedNode: Element, originalMergedNodeName: string,
                        otherNodeId: string, otherNodeName: string): void {
    this.domSplitNode(mergedNode, otherNodeName, originalMergedNodeName, otherNodeId)
  }

  static domSplitNode(node: Element, newNodeName: string, originalNodeName: string,
                      newNodeId: string): void {
    this.domRenameNode(node, originalNodeName)
    const newNode = createNewResolvedRepositoryNode(newNodeId, newNodeName, getNodeId(getParentNode(node)))
    const newSibling = new TreeNode(newNode, false)
    node.insertAdjacentElement('beforebegin', newSibling.getElement())
  }

  static domUnsplitNode(originalNode: Element, newNode: Element, originalName: string): void {
    newNode.remove()
    this.domRenameNode(originalNode, originalName)
  }

  static domRenameNode(node: Element, newName: string) {
    getNameElement(node).textContent = newName
  }

  static domReparentNode(node: Element, newParentNode: Element,
                         relativeNode: Element, relativePosition: RelativeLinearPosition): void {
    const parentChildrenNode = getChildrenElementOrCreate(newParentNode)
    if (relativePosition === RelativeLinearPosition.BEGINNING) {
      parentChildrenNode.insertBefore(node, parentChildrenNode.firstChild)
    } else if (relativePosition === RelativeLinearPosition.END) {
      parentChildrenNode.appendChild(node)
    } else if (relativePosition === RelativeLinearPosition.BEFORE) {
      relativeNode.insertAdjacentElement('beforebegin', node)
    } else if (relativePosition === RelativeLinearPosition.AFTER) {
      relativeNode.insertAdjacentElement('afterend', node)
    } else {
      throw new Error(`Invalid RelativeLinearPosition: ${relativePosition}`)
    }
  }

}

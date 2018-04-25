import { el } from 'redom'
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
  createNewResolvedRepositoryNode } from './tree-api'
import { getNodeId, getParentNode } from './tree-dom-util'

export class TreeNode {
  private el
  private anchor
  private name
  private treeService

  constructor(treeNode: ResolvedRepositoryNode, first: boolean) {
    this.el = el(
      'div',
      {
        id: treeNode.node._id,
        class: this.genClass(treeNode, first),
      },
      this.anchor = el('a', { href: `#node=${treeNode.node._id}` }, '•'), // &#8226;
      this.name = el('div.name',
        { contentEditable: true }, treeNode.node.name),
      treeNode.children && treeNode.children.length > 0 && el('div.children',
        treeNode.children.map(c => new TreeNode(c, false))),
    )
  }

  getElement(): Element {
    return this.el
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
    targetNode.children[1].textContent = targetNodeName + sourceNodeName
    // Only move source node children if it has any
    // TODO: make this childnodestuff safer with some utility methods
    if (sourceNode.children.length > 2) {
      if (targetNode.children.length <= 2) {
        targetNode.appendChild(el('div.children'))
      }
      const targetChildrenNode = targetNode.children[2]
      const sourceChildrenNode = sourceNode.children[2]
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
    const nameNode = node.children[1]
    nameNode.textContent = newName
  }

  static domReparentNode(node: Element, newParentNode: Element,
                         relativeNode: Element, relativePosition: RelativeLinearPosition): void {
    // Children of nodes are hung beneath a dedicated div.children node, so make sure that exists
    if (newParentNode.children.length <= 2) {
      newParentNode.appendChild(el('div.children'))
    }
    const parentChildrenNode = newParentNode.children[2]
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

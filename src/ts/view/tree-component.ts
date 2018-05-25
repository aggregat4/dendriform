import { el, setChildren } from 'redom'
// tslint:disable-next-line:max-line-length
import { LoadedTree, RelativeLinearPosition, RelativeNodePosition, State, createNewRepositoryNode, createNewResolvedRepositoryNode } from '../domain/domain'
// tslint:disable-next-line:max-line-length
import { Command, CommandBuilder, MergeNodesByIdCommandPayload, RenameNodeByIdCommandPayload, ReparentNodesByIdCommandPayload, SplitNodeByIdCommandPayload, TreeService, OpenNodeByIdCommandPayload, CloseNodeByIdCommandPayload } from '../service/service'
// tslint:disable-next-line:max-line-length
import { debounce, generateUUID, getCursorPos, getTextAfterCursor, getTextBeforeCursor, isCursorAtBeginning, isCursorAtEnd, isEmpty, isTextSelected } from '../util'
import { DomCommandHandler } from './command-handler-dom'
import { ServiceCommandHandler } from './command-handler-service'
import { TreeNode } from './node-component'
// tslint:disable-next-line:max-line-length
import { findLastChildNode, findNextNode, findPreviousNode, getNameElement, getNodeForNameElement, getNodeId, getNodeName, getParentNode, hasChildren, hasParentNode, isNameNode, isToggleElement, isNodeClosed } from './tree-dom-util'
import { UndoableTreeService } from '../service/tree-service-undoable'

interface TransientState {
  focusNodeId: string,
  focusCharPos: number,
  focusNodePreviousId: string,
  focusNodePreviousName: string,
  focusNodePreviousPos: number,
  treeHasBeenNavigatedTo: boolean
}

// Holds transient view state that we need to manage somehow (focus, cursor position, etc)
const transientState: TransientState = {
  focusNodeId: null,
  focusCharPos: -1,
  // previous node state so we can undo correctly, this is separate from the actual focus and char pos we want
  focusNodePreviousId: null,
  focusNodePreviousName: null,
  focusNodePreviousPos: -1,
  treeHasBeenNavigatedTo: false,
}

// We need to track when the selection changes so we can store the current
// cursor position (needed for UNDO)
document.addEventListener('selectionchange', selectionChangeHandler)

function selectionChangeHandler(event: Event): void {
  if (document.activeElement &&
    isNameNode(document.activeElement)) {
    const activeNode = getNodeForNameElement(document.activeElement)
    transientState.focusNodePreviousId = getNodeId(activeNode)
    transientState.focusNodePreviousName = getNodeName(activeNode)
    transientState.focusNodePreviousPos = getCursorPos()
  }
}

export class Tree {
  private serviceCommandHandler: ServiceCommandHandler
  private domCommandHandler = new DomCommandHandler()
  private currentRootNodeId: string
  private el
  private content
  private treeService: UndoableTreeService
  private breadcrumbs
  private searchBox
  private searchField
  private searchButton

  constructor(tree: LoadedTree, treeService: UndoableTreeService) {
    this.serviceCommandHandler = new ServiceCommandHandler(treeService)
    if (tree.tree) {
      this.currentRootNodeId = tree.tree.node._id
    }
    this.treeService = treeService
    this.el = el('div.tree',
      this.searchBox = this.generateSearchBox(),
      this.breadcrumbs = this.generateBreadcrumbs(tree),
      this.content = this.generateTreeNodes(tree))
    // We need to bind the event handlers to the class otherwise the scope with the element
    // the event was received on. Javascript! <rolls eyes>
    // Using one listeners for all nodes to reduce memory usage and the chance of memory leaks
    // This means that all event listeners here need to check whether they are triggered on
    // a relevant node
    this.el.addEventListener('input', this.onInput.bind(this))
    this.el.addEventListener('keypress', this.onKeypress.bind(this))
    this.el.addEventListener('keydown', this.onKeydown.bind(this))
    this.el.addEventListener('click', this.onToggle.bind(this))
    this.searchField.addEventListener('input', debounce(this.onQueryChange.bind(this), 250))
    // NOTE: we had this trigger on document but that seemed to cause the event to be called twice!?
    this.el.addEventListener('keydown', this.globalKeyDownHandler.bind(this))
  }

  update(tree: LoadedTree) {
    if (tree.tree) {
      this.currentRootNodeId = tree.tree.node._id
    }
    setChildren(this.el,
      // retain the searchbox as it was if we update and we already had one
      this.searchBox = this.searchBox || this.generateSearchBox(),
      this.breadcrumbs = this.generateBreadcrumbs(tree),
      this.content = this.generateTreeNodes(tree))
  }

  private generateSearchBox() {
    return el('div.searchbox',
      this.searchField = el('input', {type: 'search', placeholder: 'Filter'}))
    /* Removing the search button because we don't really need it. Right? Accesibility?
      this.searchButton = el('button', 'Filter')) */
  }

  private generateBreadcrumbs(tree: LoadedTree) {
    if (!tree.parents || tree.tree.node._id === 'ROOT') {
      return
    } else {
      // reverse because breadcrumbs need to start at ROOT and go down
      const fullParents = tree.parents.concat([createNewRepositoryNode('ROOT', 'ROOT')]).reverse()
      return el('div.breadcrumbs',
        fullParents.map(repoNode => el('span', el('a', { href: '#node=' + repoNode._id }, repoNode.name))))
    }
  }

  private generateTreeNodes(tree: LoadedTree) {
    if (tree.status.state === State.ERROR) {
      return el('div.error', `Can not load tree from backing store: ${tree.status.msg}`)
    } else if (tree.status.state === State.LOADING) {
      return el('div.error', `Loading tree...`)
    } else if (tree.status.state === State.LOADED) {
      const doFilter = !isEmpty(this.searchField.value)
      // tslint:disable-next-line:no-console
      console.log(`doFilter? `, doFilter)
      return new TreeNode(
        tree.tree,
        true,
        doFilter ? {query: this.searchField.value} : undefined)
    }
  }

  private onToggle(event: Event): void {
    if (!isToggleElement(event.target as Element)) {
      return
    }
    // NOTE: we can use the getNodeForNameElement function even though this is the
    // collapseElement because they are siblings
    const node = getNodeForNameElement(event.target as Element)
    if (isNodeClosed(node)) {
      this.domCommandHandler.domOpenNode(node)
      this.serviceCommandHandler.exec(
        new CommandBuilder(new OpenNodeByIdCommandPayload(getNodeId(node)))
          .isUndoable()
          .build())
    } else {
      this.domCommandHandler.domCloseNode(node)
      this.serviceCommandHandler.exec(
        new CommandBuilder(new CloseNodeByIdCommandPayload(getNodeId(node)))
          .isUndoable()
          .build())
    }
  }

  private onQueryChange(event: Event) {
    this.treeService.loadTree(this.currentRootNodeId).then(tree => this.update(tree))
  }

  private onInput(event: Event) {
    if (!isNameNode(event.target as Element)) {
      return
    }
    const targetNode = getNodeForNameElement((event.target as Element))
    const nodeId = getNodeId(targetNode)
    const newName = getNodeName(targetNode)
    const oldName = transientState.focusNodePreviousName
    const beforeFocusNodeId = nodeId
    const beforeFocusPos = transientState.focusNodePreviousPos
    // TODO: clean up transient state mangement, what do I need still now that we do DOM
    transientState.focusNodePreviousId = nodeId
    transientState.focusNodePreviousName = newName
    transientState.focusNodePreviousPos = getCursorPos()
    // no dom operation needed since this is a rename
    this.serviceCommandHandler.exec(
      new CommandBuilder(
        new RenameNodeByIdCommandPayload(nodeId, oldName, newName))
        .isUndoable()
        .withBeforeFocusNodeId(nodeId)
        .withBeforeFocusPos(beforeFocusPos)
        .build(),
    )
  }

  private onKeypress(event: KeyboardEvent) {
    if (!isNameNode(event.target as Element)) {
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const targetNode = getNodeForNameElement((event.target as Element))
      const nodeId = getNodeId(targetNode)
      const beforeSplitNamePart = getTextBeforeCursor(event) || ''
      const afterSplitNamePart = getTextAfterCursor(event) || ''
      const newNodeId = generateUUID()
      // make sure we save the transientstate so we can undo properly, especially when we split at the end of a node
      transientState.focusNodePreviousId = nodeId
      transientState.focusNodePreviousName = afterSplitNamePart
      transientState.focusNodePreviousPos = 0
      // we need to save this position before we start manipulating the DOM
      const beforeFocusPos = getCursorPos()
      this.domCommandHandler.domSplitNode(targetNode, beforeSplitNamePart, afterSplitNamePart, newNodeId)
      this.serviceCommandHandler.exec(
        new CommandBuilder(
          new SplitNodeByIdCommandPayload(newNodeId, nodeId, beforeSplitNamePart, afterSplitNamePart))
          .isUndoable()
          .requiresRender()
          // The before position and node is used for the after position and node in undo
          .withBeforeFocusNodeId(nodeId)
          .withBeforeFocusPos(beforeFocusPos)
          .build(),
      )
    }
  }

  private onKeydown(event: KeyboardEvent): void {
    if (!isNameNode(event.target as Element)) {
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const nodeElement = getNodeForNameElement(event.target as Element)
      if (event.shiftKey && event.altKey) {
        // this is the combination for moving a node up in its siblings or its parent's previous siblings' children
        // if the current node has siblings before it, then just move it up
        // else if the parent has previous siblings, then move it as a child of the first previous sibling at the end
        this.moveNodeUp(nodeElement)
      } else {
        const previousNode = findPreviousNode(nodeElement)
        if (previousNode) {
          this.saveTransientState(getNodeId(nodeElement), -1);
          (getNameElement(previousNode) as HTMLElement).focus()
        }
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      const nodeElement = getNodeForNameElement(event.target as Element)
      if (event.shiftKey && event.altKey) {
        // this is the combination for moving a node down in its siblings or its parent's next siblings' children
        // if the current node has siblings after it, then just move it down
        // else if the parent has next siblings, then move it as a child of the first next sibling at the end
        this.moveNodeDown(nodeElement)
      } else {
        const nextNode = findNextNode(nodeElement)
        if (nextNode) {
          this.saveTransientState(getNodeId(nodeElement), -1);
          (getNameElement(nextNode) as HTMLElement).focus()
        }
      }
    } else if (event.key === 'Backspace') {
      if (!isTextSelected() &&
          isCursorAtBeginning(event) &&
          getNodeForNameElement(event.target as Element).previousElementSibling) {
        event.preventDefault()
        const sourceNode = getNodeForNameElement(event.target as Element)
        const targetNode = sourceNode.previousElementSibling
        this.mergeNodes(sourceNode, targetNode)
      }
    } else if (event.key === 'Delete') {
      if (!isTextSelected() &&
          isCursorAtEnd(event) &&
          getNodeForNameElement(event.target as Element).nextElementSibling) {
        event.preventDefault()
        const targetNode = getNodeForNameElement(event.target as Element)
        const sourceNode = targetNode.nextElementSibling
        this.mergeNodes(sourceNode, targetNode)
      }
    } else if (event.key === 'Tab' && !event.shiftKey) {
      // When tabbing you want to make the node the last child of the previous sibling (if it exists)
      const node = getNodeForNameElement(event.target as Element)
      if (node.previousElementSibling) {
        event.preventDefault()
        // when a node is a child, it is inside a "children" container of its parent
        const oldParentNode = getParentNode(node)
        const newParentNode = node.previousElementSibling
        this.reparentNodeAt(node, getCursorPos(), oldParentNode, newParentNode, RelativeLinearPosition.END, null)
      }
    } else if (event.key === 'Tab' && event.shiftKey) {
      // When shift-Tabbing the node should become the next sibling of the parent node (if it exists)
      // Caution: we only allow unindent if the current node has a parent and a grandparent node,
      // otherwise we can not unindent
      const node = getNodeForNameElement(event.target as Element)
      if (hasParentNode(node)) {
        const oldParentNode = getParentNode(node)
        if (hasParentNode(oldParentNode)) {
          const newParentNode = getParentNode(oldParentNode)
          const afterNode = oldParentNode
          event.preventDefault()
          this.reparentNodeAt(
            node,
            getCursorPos(),
            oldParentNode,
            newParentNode,
            RelativeLinearPosition.AFTER,
            afterNode)
        }
      }
    } else if (event.key === 'Home' && event.ctrlKey) {
      // Move to the top of the current tree (not the root, but its first child)
      const treeDiv = (event.target as Element).closest('.tree')
      const firstNode = treeDiv.querySelector('div.node div.node')
      if (firstNode) {
        (getNameElement(firstNode) as HTMLElement).focus()
      }
    } else if (event.key === 'End' && event.ctrlKey) {
      // Move to the bottom (last leaf node) of the current tree
      const treeDiv = (event.target as Element).closest('.tree')
      const rootNode = treeDiv.querySelector('div.node')
      if (rootNode) {
        const lastNode = findLastChildNode(rootNode)
        if (lastNode) {
          (getNameElement(lastNode) as HTMLElement).focus()
        }
      }
    } else if (event.key === 's' && event.ctrlKey) {
      // suppress saving the page with ctrl s since that is just annoying
      // unsure whether we can do some kine of pouchdb thing here but
      // everything should be saved by now
      event.preventDefault()
    }
  }

  private moveNodeDown(nodeElement: Element): void {
    const parentNodeElement = getParentNode(nodeElement)
    if (nodeElement.nextElementSibling) {
      this.reparentNodeAt(
        nodeElement,
        getCursorPos(),
        parentNodeElement,
        parentNodeElement,
        RelativeLinearPosition.AFTER,
        nodeElement.nextElementSibling)
    } else if (parentNodeElement.nextElementSibling) {
      // the node itself has no next siblings, but if its parent has one, we will move it there
      this.reparentNodeAt(nodeElement,
        getCursorPos(),
        parentNodeElement,
        parentNodeElement.nextElementSibling,
        RelativeLinearPosition.BEGINNING,
        null)
    }
  }

  private moveNodeUp(nodeElement: Element): void {
    const parentNodeElement = getParentNode(nodeElement)
    if (nodeElement.previousElementSibling) {
      this.reparentNodeAt(
        nodeElement,
        getCursorPos(),
        parentNodeElement,
        parentNodeElement,
        RelativeLinearPosition.BEFORE,
        nodeElement.previousElementSibling)
    } else if (parentNodeElement.previousElementSibling) {
      // the node itself has no previous siblings, but if its parent has one, we will move it there
      this.reparentNodeAt(
        nodeElement,
        getCursorPos(),
        parentNodeElement,
        parentNodeElement.previousElementSibling,
        RelativeLinearPosition.END,
        null)
    }
  }

  private reparentNodeAt(node: Element, cursorPos: number, oldParentNode: Element, newParentNode: Element,
                         relativePosition: RelativeLinearPosition, relativeNode: Element): void {
    const nodeId = getNodeId(node)
    const oldAfterNodeId = node.previousElementSibling ? getNodeId(node.previousElementSibling) : null
    const oldParentNodeId = getNodeId(oldParentNode)
    const newParentNodeId = getNodeId(newParentNode)
    const position: RelativeNodePosition = {
      beforeOrAfter: relativePosition,
      nodeId: relativeNode ? getNodeId(relativeNode) : null,
    }
    this.domCommandHandler.domReparentNode(node, newParentNode, relativeNode, relativePosition)
    this.serviceCommandHandler.exec(
      new CommandBuilder(
        new ReparentNodesByIdCommandPayload(nodeId, oldParentNodeId, oldAfterNodeId, newParentNodeId, position))
        .requiresRender()
        .withAfterFocusNodeId(nodeId)
        .withAfterFocusPos(cursorPos)
        .isUndoable()
        .build(),
    )
  }

  // Helper function that works on Nodes, it extracts the ids and names, and then delegates to the other mergenodes
  // Merges are only allowed if the target node has no children
  private mergeNodes(sourceNode: Element, targetNode: Element): void {
    if (hasChildren(targetNode)) {
      return
    }
    const sourceNodeId = getNodeId(sourceNode)
    const sourceNodeName = getNodeName(sourceNode)
    const targetNodeId = getNodeId(targetNode)
    const targetNodeName = getNodeName(targetNode)
    this.domCommandHandler.domMergeNodes(sourceNode, sourceNodeName, targetNode, targetNodeName)
    this.serviceCommandHandler.exec(
      new CommandBuilder(
        new MergeNodesByIdCommandPayload(sourceNodeId, sourceNodeName, targetNodeId, targetNodeName))
        .isUndoable()
        .requiresRender()
        .withAfterFocusNodeId(targetNodeId)
        .withAfterFocusPos(Math.max(0, targetNodeName.length))
        .build(),
    )
  }

  // charPos should be -1 to just request focus on the node
  private saveTransientState(nodeId: string, charPos: number): void {
    transientState.focusNodeId = nodeId
    transientState.focusCharPos = charPos
  }

  private globalKeyDownHandler(event: KeyboardEvent): void {
    if (event.keyCode === 90 && event.ctrlKey && !event.shiftKey) { // CTRL+Z
      event.preventDefault()
      event.stopPropagation()
      this.performUndoOrRedoCommand(this.treeService.popUndoCommand())
    } else if (event.keyCode === 90 && event.ctrlKey && event.shiftKey) { // CTRL+SHIFT+Z
      event.preventDefault()
      event.stopPropagation()
      this.performUndoOrRedoCommand(this.treeService.popRedoCommand())
    }
  }

  private performUndoOrRedoCommand(command: Command): void {
    if (command) {
      this.domCommandHandler.exec(command)
      this.serviceCommandHandler.exec(command)
    }
  }
}

import { el, setChildren, setAttr, setStyle } from 'redom'
// tslint:disable-next-line:max-line-length
import { LoadedTree, RelativeLinearPosition, RelativeNodePosition, State, createNewRepositoryNode, MergeNameOrder, filterNode, FilteredRepositoryNode} from '../domain/domain'
// tslint:disable-next-line:max-line-length
import { Command, CommandBuilder, MergeNodesByIdCommandPayload, RenameNodeByIdCommandPayload, ReparentNodeByIdCommandPayload, SplitNodeByIdCommandPayload, OpenNodeByIdCommandPayload, CloseNodeByIdCommandPayload, DeleteNodeByIdCommandPayload, UpdateNoteByIdCommandPayload } from '../service/service'
// tslint:disable-next-line:max-line-length
import { debounce, generateUUID, getCursorPos, getTextAfterCursor, getTextBeforeCursor, isCursorAtBeginning, isCursorAtEnd, isEmpty, isTextSelected, setCursorPos, isCursorAtContentEditableBeginning, pasteTextUnformatted } from '../util'
import { DomCommandHandler } from './command-handler-dom'
import { TreeNode } from './node-component'
// tslint:disable-next-line:max-line-length
import { findLastChildNode, findNextNode, findPreviousNode, getNameElement, getNodeForNameElement, getNodeId, getNodeName, getParentNode, hasChildren, hasParentNode, isNameNode, isToggleElement, isNodeClosed, isNoteElement, getNodeNote, getNodeForNoteElement, isInNoteElement, findNoteElementAncestor } from './tree-dom-util'
import { UndoableCommandHandler } from '../service/command-handler-undoable'
import { TreeService } from '../service/tree-service'

// Holds transient view state that we need to manage somehow (focus, cursor position, etc)
const transientState = {
  // previous node state so we can undo correctly, this is separate from the actual focus and char pos we want
  focusNodePreviousId: null,
  focusNodePreviousName: null,
  focusNodePreviousNote: null,
  focusNodePreviousPos: -1,
}

function savePreviousNodeState(nodeId: string, nodeName: string, nodeNote: string, focusPos: number): void {
  transientState.focusNodePreviousId = nodeId
  transientState.focusNodePreviousName = nodeName
  transientState.focusNodePreviousNote = nodeNote
  transientState.focusNodePreviousPos = focusPos
}

// We need to track when the selection changes so we can store the current
// cursor position (needed for UNDO)
document.addEventListener('selectionchange', selectionChangeHandler)

function selectionChangeHandler(event: Event): void {
  if (document.activeElement &&
    isNameNode(document.activeElement)) {
    const activeNode = getNodeForNameElement(document.activeElement)
    savePreviousNodeState(
      getNodeId(activeNode),
      getNodeName(activeNode),
      getNodeNote(activeNode),
      getCursorPos())
  }
}

export class Tree {
  private domCommandHandler = new DomCommandHandler()
  private currentRootNodeId: string
  private el: Element
  private contentEl: Element
  private breadcrumbsEl: Element
  private content: TreeNode
  private searchField
  private searchButton

  constructor(readonly commandHandler: UndoableCommandHandler, readonly treeService: TreeService) {
    this.el = el('div.tree',
      el('div.searchbox',
        /* Removing the search button because we don't really need it. Right? Accesibility?
          this.searchButton = el('button', 'Filter')) */
        this.searchField = el('input', {type: 'search', placeholder: 'Filter'})),
      this.breadcrumbsEl = el('div.breadcrumbs'),
      this.contentEl = el('div.content', el('div.error', `Loading tree...`)))
    // We need to bind the event handlers to the class otherwise the scope with the element
    // the event was received on. Javascript! <rolls eyes>
    // Using one listeners for all nodes to reduce memory usage and the chance of memory leaks
    // This means that all event listeners here need to check whether they are triggered on
    // a relevant node
    this.el.addEventListener('input', this.onInput.bind(this))
    this.el.addEventListener('keypress', this.onKeypress.bind(this))
    this.el.addEventListener('keydown', this.onKeydown.bind(this))
    this.el.addEventListener('click', this.onClick.bind(this))
    this.el.addEventListener('paste', this.onPaste.bind(this))
    this.searchField.addEventListener('input', debounce(this.onQueryChange.bind(this), 250))
    // NOTE: we had this trigger on document but that seemed to cause the event to be called twice!?
    this.el.addEventListener('keydown', this.treeKeyDownHandler.bind(this))
  }

  update(tree: LoadedTree) {
    setChildren(this.breadcrumbsEl, this.generateBreadcrumbs(tree))
    if (tree.status.state === State.ERROR) {
      setChildren(this.contentEl,
        el('div.error', `Can not load tree from backing store: ${tree.status.msg}`))
    } else if (tree.status.state === State.LOADING) {
      setChildren(this.contentEl, el('div.error', `Loading tree...`))
    } else if (tree.status.state === State.LOADED) {
      this.currentRootNodeId = tree.tree.node._id
      if (!this.content) {
        this.content = new TreeNode(true)
      }
      setChildren(this.contentEl, this.content)
      this.content.update(this.getFilteredTree(tree))
    }
  }

  private generateBreadcrumbs(tree: LoadedTree): Element[] {
    if (!tree.parents || tree.tree.node._id === 'ROOT') {
      return []
    } else {
      // reverse because breadcrumbs need to start at ROOT and go down
      const fullParents = tree.parents.concat([createNewRepositoryNode('ROOT', 'ROOT')]).reverse()
      return fullParents.map(repoNode => el('span', el('a', { href: '#node=' + repoNode._id }, repoNode.name)))
    }
  }

  private getFilteredTree(tree: LoadedTree): FilteredRepositoryNode {
    const doFilter = !isEmpty(this.searchField.value)
    return filterNode(tree.tree, doFilter ? {query: this.searchField.value} : undefined)
  }

  private onClick(event: Event): void {
    if (isToggleElement(event.target as Element)) {
      event.preventDefault()
      // NOTE: we can use the getNodeForNameElement function even though this is the
      // collapseElement because they are siblings
      const node = getNodeForNameElement(event.target as Element)
      const payload = isNodeClosed(node)
        ? new OpenNodeByIdCommandPayload(getNodeId(node))
        : new CloseNodeByIdCommandPayload(getNodeId(node))
      this.performCommand(new CommandBuilder(payload).isUndoable().build())
    } else if (isInNoteElement(event.target as Element)) {
      // for a note we need to take into account that a note may have its own markup (hence isInNoteElement)
      const noteElement = findNoteElementAncestor(event.target as Element) as HTMLElement
      if (! noteElement.isContentEditable) {
        event.preventDefault()
        Tree.startEditingNote(noteElement as HTMLElement)
      }
    }
  }

  private onPaste(event: ClipboardEvent): void {
    // We don't want any formatted HTML pasted in our nodes.
    // Inside a note we can be inside some child HTML tags, so we need to to a more thorough check
    if (isNameNode(event.target as Element) || isInNoteElement(event.target as Element)) {
      event.preventDefault()
      pasteTextUnformatted(event)
    }
  }

  private onQueryChange(event: Event) {
    this.rerenderTree()
  }

  private rerenderTree(): Promise<any> {
    return this.treeService.loadTree(this.currentRootNodeId).then(tree => this.update(tree))
  }

  private onInput(event: Event) {
    // apparently we can get some fancy newfangled input events we may want to ignore
    // see https://www.w3.org/TR/input-events-1/
    if ((event as any).inputType === 'historyUndo' ||
        (event as any).inputType === 'historyRedo') {
      return
    }
    if (isNameNode(event.target as Element)) {
      const targetNode = getNodeForNameElement((event.target as Element))
      const nodeId = getNodeId(targetNode)
      const newName = getNodeName(targetNode)
      const oldName = transientState.focusNodePreviousName
      const beforeFocusNodeId = nodeId
      const beforeFocusPos = transientState.focusNodePreviousPos
      const afterFocusPos = getCursorPos()
      savePreviousNodeState(nodeId, newName, getNodeNote(targetNode), afterFocusPos)
      // no dom operation needed since this is an inline update
      this.commandHandler.exec(
        new CommandBuilder(
          new RenameNodeByIdCommandPayload(nodeId, oldName, newName))
          .isUndoable()
          .withBeforeFocusNodeId(beforeFocusNodeId)
          .withBeforeFocusPos(beforeFocusPos)
          .withAfterFocusNodeId(nodeId)
          .withAfterFocusPos(afterFocusPos)
          .build())
    } else if (isNoteElement(event.target as Element)) {
      const targetNode = getNodeForNoteElement((event.target as Element))
      const nodeId = getNodeId(targetNode)
      const name = getNodeName(targetNode)
      const newNote = getNodeNote(targetNode)
      const oldNote = transientState.focusNodePreviousNote
      const beforeFocusNodeId = nodeId
      const beforeFocusPos = transientState.focusNodePreviousPos
      const afterFocusPos = getCursorPos()
      savePreviousNodeState(nodeId, name, newNote, afterFocusPos)
      // no dom operation needed since this is an inline update
      this.commandHandler.exec(
        new CommandBuilder(
          new UpdateNoteByIdCommandPayload(nodeId, oldNote, newNote))
          .isUndoable()
          .withBeforeFocusNodeId(beforeFocusNodeId)
          .withBeforeFocusPos(beforeFocusPos)
          .withAfterFocusNodeId(nodeId)
          .withAfterFocusPos(afterFocusPos)
          .build())
    }
  }

  private onKeypress(event: KeyboardEvent) {
    if (!isNameNode(event.target as Element)) {
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) { // trigger node splitting
      event.preventDefault()
      const targetNode = getNodeForNameElement((event.target as Element))
      const nodeId = getNodeId(targetNode)
      const beforeSplitNamePart = getTextBeforeCursor(event) || ''
      const afterSplitNamePart = getTextAfterCursor(event) || ''
      const newNodeId = generateUUID()
      // make sure we save the transientstate so we can undo properly, especially when we split at the end of a node
      savePreviousNodeState(nodeId, afterSplitNamePart, getNodeNote(targetNode), 0)
      const command = new CommandBuilder(
        new SplitNodeByIdCommandPayload(newNodeId, nodeId, beforeSplitNamePart,
                                        afterSplitNamePart, MergeNameOrder.SOURCE_TARGET))
          .isUndoable()
          // The before position and node is used for the after position and node in undo
          .withBeforeFocusNodeId(nodeId)
          .withBeforeFocusPos(getCursorPos())
          .withAfterFocusNodeId(nodeId)
          .withAfterFocusPos(0)
          .build()
      this.performCommand(command)
    } else if (event.key === 'Enter' && event.shiftKey) { // trigger note editing
      event.preventDefault()
      const noteEl = (event.target as Element).nextElementSibling.nextElementSibling as HTMLElement
      Tree.startEditingNote(noteEl)
    }
  }

  // install event handler to listen for escape (or backspace in the beginning when empty,
  //   or arrow up in beginning, etc)
  // TODO: I would like to have this code on the node-component but then I would need to put the
  // event handlers there and I prefer having them globally... what to do?
  private static startEditingNote(noteEl: HTMLElement): void {
    // hard assumption that we have two siblings and the last one is the note element
    setAttr(noteEl, { contentEditable: true, class: 'note editing' })
    setStyle(noteEl, { display: 'block' })
    noteEl.addEventListener('keydown', Tree.onNoteKeydown)
    noteEl.addEventListener('blur', Tree.onNoteBlur)
    noteEl.focus()
  }

  private static stopEditingNote(noteEl: HTMLElement, refocus: boolean): void {
    noteEl.removeEventListener('keydown', Tree.onNoteKeydown)
    noteEl.removeEventListener('blur', Tree.onNoteBlur)
    setAttr(noteEl, { contentEditable: false, class: 'note' })
    noteEl.style.display = null
    if (refocus) {
      const nameEl = noteEl.previousElementSibling.previousElementSibling as HTMLElement
      nameEl.focus()
    }
  }

  private static onNoteKeydown(event: KeyboardEvent): void {
    if ((event.key === 'Escape') ||
        (event.key === 'ArrowUp' && isCursorAtContentEditableBeginning('note'))) {
      event.preventDefault()
      Tree.stopEditingNote(event.target as HTMLElement, true)
    }
  }

  private static onNoteBlur(event: FocusEvent): void {
    event.preventDefault()
    Tree.stopEditingNote(event.target as HTMLElement, false)
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
          (getNameElement(nextNode) as HTMLElement).focus()
        }
      }
    } else if (event.key === 'Backspace' && event.shiftKey && event.ctrlKey) {
      event.preventDefault()
      const eventNode = getNodeForNameElement(event.target as Element)
      this.deleteNode(eventNode)
    } else if (event.key === 'Backspace' && !event.shiftKey && !event.ctrlKey) {
      if (!isTextSelected() && isCursorAtBeginning(event)) {
        const eventNode = getNodeForNameElement(event.target as Element)
        if (isEmpty(getNodeName(eventNode)) && !hasChildren(eventNode)) {
          // this is a special case for convience: when a node is empty and has no
          // children, we interpret backspace as deleting the complete node
          event.preventDefault()
          this.deleteNode(eventNode)
        } else if (getNodeForNameElement(event.target as Element).previousElementSibling) {
          const targetNode = eventNode
          const sourceNode = targetNode.previousElementSibling
          if (hasChildren(sourceNode)) {
            return
          }
          event.preventDefault()
          const sourceNodeId = getNodeId(sourceNode)
          const sourceNodeName = getNodeName(sourceNode)
          const targetNodeId = getNodeId(targetNode)
          const targetNodeName = getNodeName(targetNode)
          const command = new CommandBuilder(
            new MergeNodesByIdCommandPayload(sourceNodeId, sourceNodeName,
                                             targetNodeId, targetNodeName, MergeNameOrder.SOURCE_TARGET))
            .isUndoable()
            .withBeforeFocusNodeId(targetNodeId)
            .withBeforeFocusPos(0)
            .withAfterFocusNodeId(targetNodeId)
            .withAfterFocusPos(Math.max(0, sourceNodeName.length))
            .build()
          this.performCommand(command)
        }
      }
    } else if (event.key === 'Delete') {
      if (!isTextSelected() &&
          isCursorAtEnd(event) &&
          getNodeForNameElement(event.target as Element).nextElementSibling) {
        event.preventDefault()
        const sourceNode = getNodeForNameElement(event.target as Element)
        const targetNode = sourceNode.nextElementSibling
        if (hasChildren(sourceNode)) {
          return
        }
        const sourceNodeId = getNodeId(sourceNode)
        const sourceNodeName = getNodeName(sourceNode)
        const targetNodeId = getNodeId(targetNode)
        const targetNodeName = getNodeName(targetNode)
        const command = new CommandBuilder(
          new MergeNodesByIdCommandPayload(sourceNodeId, sourceNodeName,
                                           targetNodeId, targetNodeName, MergeNameOrder.SOURCE_TARGET))
          .isUndoable()
          .withBeforeFocusNodeId(sourceNodeId)
          .withBeforeFocusPos(getCursorPos())
          .withAfterFocusNodeId(targetNodeId)
          .withAfterFocusPos(Math.max(0, sourceNodeName.length))
          .build()
        this.performCommand(command)
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
          event.preventDefault()
          const newParentNode = getParentNode(oldParentNode)
          const afterNode = oldParentNode
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

  // TODO: currently we can delete anything, but we don't deal well with deleting the toplevel
  // node, perhaps we should just prevent that? When you go to the root node you can delete all
  // children anyway?
  private deleteNode(node: Element): void {
    const nodeId = getNodeId(node)
    const builder = new CommandBuilder(new DeleteNodeByIdCommandPayload(nodeId))
      .isUndoable()
      .withBeforeFocusNodeId(nodeId)
      .withBeforeFocusPos(getCursorPos())
    const previousNode = findPreviousNode(node)
    // when deleting a node we attempt to set focus afterwards to the previous node in the tree
    // using the same algorithm for moving up and down
    if (previousNode) {
      builder
        .withAfterFocusNodeId(getNodeId(previousNode))
        .withAfterFocusPos(getNodeName(previousNode).length)
    }
    this.performCommand(builder.build())
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
      nodeId: relativeNode ? getNodeId(relativeNode) : null,
      beforeOrAfter: relativeNode ? relativePosition : RelativeLinearPosition.END,
    }
    const command = new CommandBuilder(
      new ReparentNodeByIdCommandPayload(nodeId, oldParentNodeId, oldAfterNodeId, newParentNodeId, position))
      .withBeforeFocusNodeId(nodeId)
      .withBeforeFocusPos(cursorPos)
      .withAfterFocusNodeId(nodeId)
      .withAfterFocusPos(cursorPos)
      .isUndoable()
      .build()
    this.performCommand(command)
  }

  private treeKeyDownHandler(event: KeyboardEvent): void {
    if (event.keyCode === 90 && event.ctrlKey && !event.shiftKey) { // CTRL+Z
      event.preventDefault()
      event.stopPropagation()
      this.performCommand(this.commandHandler.popUndoCommand())
    } else if (event.keyCode === 90 && event.ctrlKey && event.shiftKey) { // CTRL+SHIFT+Z
      event.preventDefault()
      event.stopPropagation()
      this.performCommand(this.commandHandler.popRedoCommand())
    }
  }

  private performCommand(command: Command): void {
    if (command) {
      this.domCommandHandler.exec(command)
      const commandPromise = this.commandHandler.exec(command)
      // If a command requires a rerender this means we need to reload the tree
      // and then let Redom efficiently update all the nodes, however if we need
      // to focus afterwards, we need to be careful to do this after having loaded
      // the tree
      if (command.payload.requiresRender()) {
        commandPromise.then(this.rerenderTree.bind(this)).then(() => {
          if (command.afterFocusNodeId) {
            this.focus(command.afterFocusNodeId, command.afterFocusPos)
          }
        })
      } else  {
        if (command.afterFocusNodeId) {
          this.focus(command.afterFocusNodeId, command.afterFocusPos)
        }
      }
    }
  }

  private focus(nodeId: string, charPos: number) {
    const element = document.getElementById(nodeId)
    // tslint:disable-next-line:no-console
    // console.log(`focusing on node ${nodeId} at ${charPos}, exists?`, element)
    if (element) {
      const nameElement: HTMLElement = getNameElement(element) as HTMLElement
      nameElement.focus()
      if (charPos > -1) {
        setCursorPos(nameElement, charPos)
      }
    }
  }

}

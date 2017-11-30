import {h, VNode} from 'maquette'
import * as repo from './repository'
import {getCursorPos, setCursorPos, isCursorAtBeginning, isCursorAtEnd, getTextBeforeCursor, getTextAfterCursor} from './util'
import {findPreviousNameNode, findNextNameNode, getParentNode, hasParentNode, getNodeId, getNodeName, isNode, hasChildren} from './tree-util'
import { RepositoryNode, ResolvedRepositoryNode } from './repository';

enum State {
  LOADING,
  LOADED,
  ERROR
}

interface Status {
  state: State
  msg: string
}

interface Store {
  status: Status
  tree: repo.ResolvedRepositoryNode
}

const STORE : Store = {
  status: {
    state: State.LOADING,
    msg: null
  } as Status,
  tree: null
}

interface TransientState {
  focusNodeId: string,
  focusCharPos: number,
  focusNodePreviousId: string,
  focusNodePreviousName: string,
  focusNodePreviousPos: number
}

// Holds transient view state that we need to manage somehow (focus, cursor position, etc)
const transientState : TransientState = {
  focusNodeId: null,
  focusCharPos: -1,
  // previus node state so we can undo correctly, this is separate from the actual focus and char pos we want
  focusNodePreviousId: null,
  focusNodePreviousName: null,
  focusNodePreviousPos: -1
}

// We need to support UNDO when activated anywhere in the document
document.addEventListener('keydown', globalKeyDownHandler)
// We need to track when the selection changes so we can store the current 
// cursor position (needed for UNDO)
document.addEventListener('selectionchange', selectionChangeHandler)

export function load(nodeId: string) : Promise<Status> {
  return repo.loadTree(nodeId)
    .then((tree) => {
      STORE.tree = tree
      STORE.status.state = State.LOADED
      return Promise.resolve(STORE.status)
    })
    .catch((reason) => {
      if (reason.status === 404 && nodeId === 'ROOT') {
        // When the root node was requested but could not be found, initialize the tree with a minimal structure
        return initializeEmptyTree().then(() => load(nodeId))
      } else {
        STORE.tree = null
        STORE.status.state = State.ERROR
        STORE.status.msg = `Error loading tree: ${reason}`
        return Promise.resolve(STORE.status)
      }
    })
}

function initializeEmptyTree () : Promise<RepositoryNode> {
  return repo.createNode('ROOT', 'ROOT', null)
    .then(() => repo.createNode(null, '', null))
    .then(child => repo.addChildToParent(child._id, 'ROOT'))
}

// Virtual DOM nodes need a common parent, otherwise maquette will complain, that's
// one reason why we have the toplevel div.tree
export function render () : VNode {
  return h('div.tree', renderTree())
}

function renderTree() : VNode[] {
  switch(STORE.status.state) {
    case State.ERROR:   return [h('div.error', [`Can not load tree from backing store: ${STORE.status.msg}`])]
    case State.LOADING: return [h('div', [`Loading tree...`])]
    case State.LOADED:  return [renderNode(STORE.tree, true)]
    default:            return [h('div.error', [`Tree is in an unknown state`])]
  }
}

function renderNode (node: repo.ResolvedRepositoryNode, first: boolean) : VNode {
  function isRoot (node: RepositoryNode) : boolean {
    return node._id === 'ROOT'
  }
  function renderChildren (children: repo.ResolvedRepositoryNode[]) : VNode[]  {
    if (children && children.length > 0) {
      return [h('div.children', children.map(c => renderNode(c, false)))]
    } else {
      return []
    }
  }
  function genClass (resolvedNode: ResolvedRepositoryNode, isFirst: boolean) : string {
    return 'node' + (isRoot(resolvedNode.node) ? ' root' : '') + (isFirst ? ' first' : '')
  }
  // TODO if there are no children in root yet, create an artifical one that is empty
  return h('div',
    {
      id: node.node._id,
      key: node.node._id + ':' + node.node._rev,
      'data-rev': node.node._rev,
      class: genClass(node, first)
    },
    [
      h('a', { href: `#node=${node.node._id}` }, ['*']),
      h('div.name', {
        // this data attribute only exists so that we can focus this node after
        // it has been created in afterCreateHandler, we would like to get it
        // from the parent dom node, but for some reason it is not there yet then
        'data-nodeid': node.node._id,
        contentEditable: 'true',
        oninput: nameInputHandler,
        // the keypress event seems to be necessary to intercept (and prevent) the Enter key, input did not work
        onkeypress: nameKeypressHandler,
        onkeydown: nameKeydownHandler,
        // special maquette handlers that get triggered on certain VDOM operations
        afterCreate: transientStateHandler,
        afterUpdate: transientStateHandler
      }, [node.node.name])
    ].concat(renderChildren(node.children)))
}

// as per http://maquettejs.org/docs/typedoc/interfaces/_maquette_.vnodeproperties.html#aftercreate
// here we set focus to a node if it has been created and we set it as the focusable node in transientstate
function transientStateHandler (element: HTMLElement) : void {
  if (transientState && transientState.focusNodeId && element.getAttribute('data-nodeid') === transientState.focusNodeId) {
    element.focus()
    if (transientState.focusCharPos > -1) {
      setCursorPos(element, transientState.focusCharPos)
    }
    transientState.focusNodeId = null
    transientState.focusCharPos = -1
  }
}

// When entering a node with the cursor, we need to initialize some transient state
// that is required for implementing UNDO handling. This state is later updated in the
// actual mutating methods, but we need a valid initial (and previous) value
//
// In a sane universe we would use the onfocus event on the node name to track this
// position: this would allow us to very easily set the cursor position just once on
// getting the focus in the node name. HOWEVER it appears that the onfocus event is
// faster than updating the selection and so we get stale values from that approach.
function selectionChangeHandler (event: Event) : void {
  if (document.activeElement &&
      document.activeElement.parentNode &&
      isNode(document.activeElement.parentElement)) {
    const activeNode = document.activeElement.parentElement
    transientState.focusNodePreviousId = getNodeId(activeNode)
    transientState.focusNodePreviousName = getNodeName(activeNode)
    transientState.focusNodePreviousPos = getCursorPos()
  }
}

function nameInputHandler (event: Event) : void {
  const targetNode = (event.target as Element).parentElement
  const nodeId = getNodeId(targetNode)
  const newName = getNodeName(targetNode)
  const oldName = transientState.focusNodePreviousName
  const beforeFocusNodeId = nodeId
  const beforeFocusPos = transientState.focusNodePreviousPos
  transientState.focusNodePreviousId = nodeId
  transientState.focusNodePreviousName = newName
  transientState.focusNodePreviousPos = getCursorPos()
  executeCommand(
    new CommandBuilder(() => renameNodeById(nodeId, oldName, newName))
      .isUndoable()
      .withBeforeFocusNodeId(beforeFocusNodeId)
      .withBeforeFocusPos(beforeFocusPos)
      .build()
  )
}

// NOTE from the MDN docs: "The keypress event is fired when a key is pressed down and
// that key normally produces a character value"
function nameKeypressHandler (event: KeyboardEvent) : void {
  if (event.key === 'Enter') {
    event.preventDefault()
    const targetNode = (event.target as Element).parentElement
    const nodeId = getNodeId(targetNode)
    const beforeSplitNamePart = getTextBeforeCursor(event) || ''
    const afterSplitNamePart = getTextAfterCursor(event) || ''
    executeCommand(
      new CommandBuilder(() => splitNodeById(nodeId, beforeSplitNamePart, afterSplitNamePart))
        .isUndoable()
        .requiresRender()
        .withAfterFocusNodeId(nodeId)
        .build()
    )
  }
}

// for reference, Key values: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values
function nameKeydownHandler (event: KeyboardEvent) : void {
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    const previousNode = findPreviousNameNode(event.target as Element)
    if (previousNode) {
      (previousNode as HTMLElement).focus()
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    const nextNode = findNextNameNode(event.target as Element)
    if (nextNode) {
      (nextNode as HTMLElement).focus()
    }
  } else if (event.key === 'Backspace') {
    if (isCursorAtBeginning(event) && (event.target as Element).parentElement.previousElementSibling) {
      event.preventDefault()
      const sourceNode = (event.target as Element).parentElement
      const targetNode = sourceNode.previousElementSibling
      mergeNodes(sourceNode, targetNode)
    }
  } else if (event.key === 'Delete') {
    if (isCursorAtEnd(event) && (event.target as Element).parentElement.nextElementSibling) {
      event.preventDefault()
      const targetNode = (event.target as Element).parentElement
      const sourceNode = targetNode.nextElementSibling
      mergeNodes(sourceNode, targetNode)
    }
  } else if (event.key === 'Tab' && !event.shiftKey) {
    // When tabbing you want to make the node the last child of the previous sibling (if it exists)
    const node = (event.target as Element).parentElement
    if (node.previousElementSibling) {
      event.preventDefault()
      // when a node is a child, it is inside a "children" container of its parent
      const oldParentNode = getParentNode(node)
      const newParentNode = node.previousElementSibling
      reparentNode(node, getCursorPos(), oldParentNode, newParentNode)
    }
  } else if (event.key === 'Tab' && event.shiftKey) {
    // When shift-Tabbing the node should become the next sibling of the parent node (if it exists)
    // Caution: we only allow unindent if the current node has a parent and a grandparent node, otherwise we can not unindent
    const node = (event.target as Element).parentElement
    if (hasParentNode(node)) {
      const oldParentNode = getParentNode(node)
      if (hasParentNode(oldParentNode)) {
        const newParentNode = getParentNode(oldParentNode)
        const afterNode = oldParentNode
        event.preventDefault()
        reparentNodeAfter(node, getCursorPos(), oldParentNode, newParentNode, afterNode)
      }
    }
  }
}

function globalKeyDownHandler (event: KeyboardEvent) : void {
  if (event.keyCode === 90 && event.ctrlKey) { // CTRL+Z, so trigger UNDO
    event.preventDefault()
    const undoCommand = UNDO_BUFFER.pop()
    if (undoCommand) {
      executeCommand(undoCommand)
    }
  }
}

// Helper function that works on Nodes, it extracts the ids and names, and then delegates to the other mergenodes
// Merges are only allowed if the target node has no children
function mergeNodes (sourceNode: Element, targetNode: Element) : void {
  if (hasChildren(targetNode)) {
    return
  }
  const sourceNodeId = getNodeId(sourceNode)
  const sourceNodeName = getNodeName(sourceNode)
  const targetNodeId = getNodeId(targetNode)
  const targetNodeName = getNodeName(targetNode)
  executeCommand(
    new CommandBuilder(() => mergeNodesById(sourceNodeId, sourceNodeName, targetNodeId, targetNodeName))
      .isUndoable()
      .requiresRender()
      .withAfterFocusNodeId(targetNodeId)
      .withAfterFocusPos(Math.max(0, targetNodeName.length))
      .build()
  )
}

function reparentNode (node: Element, cursorPos: number, oldParentNode: Element, newParentNode: Element) : void {
  reparentNodeAfter(node, cursorPos, oldParentNode, newParentNode, null)
}

function reparentNodeAfter (node: Element, cursorPos: number, oldParentNode: Element, newParentNode: Element, afterNode: Element) : void {
  const nodeId = getNodeId(node)
  const oldAfterNodeId = node.previousElementSibling ? getNodeId(node.previousElementSibling) : null
  const oldParentNodeId = getNodeId(oldParentNode)
  const newParentNodeId = getNodeId(newParentNode)
  const afterNodeId = afterNode ? getNodeId(afterNode) : null
  executeCommand(
    new CommandBuilder(() => reparentNodesById(nodeId, oldParentNodeId, oldAfterNodeId, newParentNodeId, afterNodeId))
      .requiresRender()
      .withAfterFocusNodeId(nodeId)
      .withAfterFocusPos(cursorPos)
      .isUndoable()
      .build()
  )
}

// --------- Some functions that represent higher level actions on nodes, separate from dom stuff

function triggerTreeReload () : void {
  window.dispatchEvent(new Event('treereload'))
}

// charPos should be -1 to just request focus on the node
function requestFocusOnNodeAtChar (nodeId: string, charPos: number) {
  transientState.focusNodeId = nodeId
  transientState.focusCharPos = charPos
}

const UNDO_BUFFER : Command[] = []
const REDO_BUFFER : Command[] = []

class CommandBuilder {
  fn : () => Promise<Command[]>
  renderRequired : boolean = false
  beforeFocusNodeId : string = null
  beforeFocusPos : number = -1
  afterFocusNodeId : string = null
  afterFocusPos : number = -1
  undoable : boolean = false

  constructor (fn: () => Promise<Command[]>) {
    this.fn = fn
  }

  requiresRender () : CommandBuilder {
    this.renderRequired = true
    return this
  }

  withBeforeFocusNodeId (beforeFocusNodeId: string) : CommandBuilder {
    this.beforeFocusNodeId = beforeFocusNodeId
    return this
  }

  withBeforeFocusPos (beforeFocusPos: number) : CommandBuilder {
    this.beforeFocusPos = beforeFocusPos
    return this
  }

  withAfterFocusNodeId (afterFocusNodeId: string) : CommandBuilder {
    this.afterFocusNodeId = afterFocusNodeId
    return this
  }

  withAfterFocusPos (afterFocusPos: number) : CommandBuilder {
    this.afterFocusPos = afterFocusPos
    return this
  }

  isUndoable () : CommandBuilder {
    this.undoable = true
    return this
  }

  build () : Command {
    return new Command(
      this.fn,
      this.renderRequired,
      this.beforeFocusNodeId,
      this.beforeFocusPos,
      this.afterFocusNodeId,
      this.afterFocusPos,
      this.undoable
    )
  }
}

class Command {
  fn : () => Promise<Command[]>
  renderRequired : boolean = false
  beforeFocusNodeId : string = null
  beforeFocusPos : number = -1
  afterFocusNodeId : string = null
  afterFocusPos : number = -1
  undoable : boolean = false

  constructor (fn: () => Promise<Command[]>, renderRequired: boolean, beforeFocusNodeId: string, beforeFocusPos: number, afterFocusNodeId: string, afterFocusPos: number, undoable: boolean) {
    this.fn = fn
    this.renderRequired = renderRequired
    this.beforeFocusNodeId = beforeFocusNodeId
    this.beforeFocusPos = beforeFocusPos
    this.afterFocusNodeId = afterFocusNodeId
    this.afterFocusPos = afterFocusPos
    this.undoable = undoable
  }
}

function executeCommand (command: Command) : void {
  // console.log(`executing command: ${JSON.stringify(command)}`)
  command.fn()
    .then(undoCommands => {
      if (command.undoable) {
        undoCommands.forEach(c => {
          // if a command is triggered and there was a valid focus position before the change
          // then we want to restore the focus to that position after executing the undo command
          if (command.beforeFocusNodeId) {
            c.afterFocusNodeId = command.beforeFocusNodeId
            c.afterFocusPos = command.beforeFocusPos
          }
        })
        // console.log(`storing UNDO command: ${JSON.stringify(undoCommands)}`)
        UNDO_BUFFER.push(...undoCommands)
      }
    })
    .then(() => command.undoable && REDO_BUFFER.push(command))
    .then(() => command.afterFocusNodeId && requestFocusOnNodeAtChar(command.afterFocusNodeId, command.afterFocusPos))
    .then(() => command.renderRequired && triggerTreeReload())
}

// 1. rename the current node to the right hand side of the split
// 2. insert a new sibling BEFORE the current node containing the left hand side of the split
function splitNodeById (nodeId: string, beforeSplitNamePart: string, afterSplitNamePart: string) : Promise<Command[]> {
  console.log(`splitNodeById`)
  return repo.renameNode(nodeId, afterSplitNamePart)
    .then((result) => repo.createSiblingBefore(beforeSplitNamePart, null, nodeId))
    .then((newSiblingRepoNode) => ([
      new CommandBuilder(() => _unsplitNodeById(newSiblingRepoNode._id, nodeId, beforeSplitNamePart + afterSplitNamePart))
        .requiresRender()
        .build()
    ]))
}

function _unsplitNodeById (newNodeId: string, originalNodeId: string, name: string) : Promise<Command[]> {
  return repo.deleteNode(newNodeId)
    .then(() => repo.renameNode(originalNodeId, name))
    .then(() => ([])) // TODO these are not really commands, we don't need to undo these (and can't)
}

// 1. rename targetnode to be targetnode.name + sourcenode.name
// 2. move all children of sourcenode to targetnode (actual move, just reparent)
// 3. delete sourcenode
// 4. focus the new node at the end of its old name
//
// For undo it is assumed that a merge never happens to a target node with children
// This function will not undo the merging of the child collections (this mirrors workflowy
// maybe we want to revisit this in the future)
function mergeNodesById (sourceNodeId: string, sourceNodeName: string, targetNodeId: string, targetNodeName: string) : Promise<Command[]> {
  return repo.getChildNodes(sourceNodeId, true) // TODO add flag to also get deleted nodes!
    .then(children => repo.reparentNodes(children, targetNodeId))
    .then(() => repo.renameNode(targetNodeId, targetNodeName + sourceNodeName))
    .then(() => repo.deleteNode(sourceNodeId))
    .then(() => ([
      new CommandBuilder(() => _unmergeNodesById(sourceNodeId, targetNodeId, targetNodeName))
        .requiresRender()
        .build()
    ]))
}

// We need dedicated "unmerge" command because when we merge, we delete a node and if we
// want to undo that action we need to be able to "resurrect" that node so that a chain
// of undo commands has a chance of working since they may refer to that original node's Id.
function _unmergeNodesById (sourceNodeId: string, targetNodeId: string, targetNodeName: string) : Promise<Command[]> {
  return repo.undeleteNode(sourceNodeId)
    .then(() => repo.getChildNodes(targetNodeId, true))
    .then(children => repo.reparentNodes(children, sourceNodeId))
    .then(() => repo.renameNode(targetNodeId, targetNodeName))
    .then(() => ([])) // TODO these are not really commands, we don't need to undo these (and can't)
}

function renameNodeById (nodeId: string, oldName: string, newName: string) : Promise<Command[]> {
  console.log(`renaming from '${oldName}' to '${newName}'`)
  return repo.renameNode(nodeId, newName)
    .then(() => ([
      new CommandBuilder(() => renameNodeById(nodeId, newName, oldName))
        .requiresRender()
        .build()
    ]))
}

// 1. set the node's parent Id to the new id
// 2. add the node to the new parent's children
// 3. remove the node from the old parent's children
function reparentNodesById (nodeId: string, oldParentNodeId: string, oldAfterNodeId: string, newParentNodeId: string, afterNodeId: string) : Promise<Command[]> {
  return repo.getNode(nodeId)
    .then(node => repo.reparentNodes([node], newParentNodeId, afterNodeId))
    .then(() => ([
      new CommandBuilder(() => reparentNodesById(nodeId, newParentNodeId, null, oldParentNodeId, oldAfterNodeId))
        .requiresRender()
        .build()
    ]))
}

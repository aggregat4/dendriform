import {h, VNode} from 'maquette'
import {
  getCursorPos,
  setCursorPos,
  isCursorAtBeginning,
  isCursorAtEnd,
  getTextBeforeCursor,
  getTextAfterCursor
} from './util'
import {
  findPreviousNameNode,
  findNextNameNode,
  getParentNode,
  hasParentNode,
  getNodeId,
  getNodeName,
  isNode,
  hasChildren
} from './tree-util'
import {
  RepositoryNode,
  ResolvedRepositoryNode,
  initializeEmptyTree,
  loadTree,
  Command,
  CommandBuilder,
  executeCommand,
  popLastUndoCommand,
  buildSplitNodeByIdCommand,
  buildRenameNodeByIdCommand,
  buildMergeNodesByIdCommand,
  buildReparentNodesByIdCommand
} from './tree-api'

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
  tree: ResolvedRepositoryNode
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
  return loadTree(nodeId)
    .then((tree) => {
      STORE.tree = tree
      STORE.status.state = State.LOADED
      return Promise.resolve(STORE.status)
    })
    .catch((reason) => {
      if (reason.status === 404 && nodeId === 'ROOT') {
        // When the root node was requested but could not be found, initialize the tree with a minimal structure
        return initializeEmptyTree().then(() => load(nodeId))
      } else if (reason.status == 404) {
        // In case we are called with a non existent ID and it is not root, just load the root node
        // TODO should we rather handle this in the UI and redirect to the root node?
        return load('ROOT')
      } else {
        STORE.tree = null
        STORE.status.state = State.ERROR
        STORE.status.msg = `Error loading tree: ${reason}`
        return Promise.resolve(STORE.status)
      }
    })
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

function renderNode (resolvedNode: ResolvedRepositoryNode, first: boolean) : VNode {
  function isRoot (node: RepositoryNode) : boolean {
    return node._id === 'ROOT'
  }
  function renderChildren (children: ResolvedRepositoryNode[]) : VNode[]  {
    if (children && children.length > 0) {
      return [h('div.children', children.map(c => renderNode(c, false)))]
    } else {
      return []
    }
  }
  function genClass (resolvedNode: ResolvedRepositoryNode, isFirst: boolean) : string {
    return 'node' + (isRoot(resolvedNode.node) ? ' root' : '') + (isFirst ? ' first' : '')
  }
  // set focus to the first element of the tree if we have not already requested focus for something else
  if (!transientState.focusNodeId && !isRoot(resolvedNode.node)) {
    requestFocusOnNodeAtChar(resolvedNode.node._id, -1)
  }
  // TODO if there are no children in root yet, create an artifical one that is empty
  return h('div',
    {
      id: resolvedNode.node._id,
      key: resolvedNode.node._id + ':' + resolvedNode.node._rev,
      'data-rev': resolvedNode.node._rev,
      class: genClass(resolvedNode, first)
    },
    [
      h('a', { href: `#node=${resolvedNode.node._id}` }, ['*']),
      h('div.name', {
        // this data attribute only exists so that we can focus this node after
        // it has been created in afterCreateHandler, we would like to get it
        // from the parent dom node, but for some reason it is not there yet then
        'data-nodeid': resolvedNode.node._id,
        contentEditable: 'true',
        oninput: nameInputHandler,
        // the keypress event seems to be necessary to intercept (and prevent) the Enter key, input did not work
        onkeypress: nameKeypressHandler,
        onkeydown: nameKeydownHandler,
        // special maquette handlers that get triggered on certain VDOM operations
        afterCreate: transientStateHandler,
        afterUpdate: transientStateHandler
      }, [resolvedNode.node.name])
    ].concat(renderChildren(resolvedNode.children)))
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
  exec(
    buildRenameNodeByIdCommand(nodeId, oldName, newName)
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
    exec(
      buildSplitNodeByIdCommand(nodeId, beforeSplitNamePart, afterSplitNamePart)
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
    const previousNameNode = findPreviousNameNode(event.target as Element) as HTMLElement
    if (previousNameNode) {
      requestFocusOnNodeAtChar(getNodeId(previousNameNode.parentElement), -1)      
      previousNameNode.focus()
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    const nextNameNode = findNextNameNode(event.target as Element) as HTMLElement
    if (nextNameNode) {
      requestFocusOnNodeAtChar(getNodeId(nextNameNode.parentElement), -1)
      nextNameNode.focus()
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
    const undoCommand = popLastUndoCommand()
    if (undoCommand) {
      exec(undoCommand)
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
  exec(
    buildMergeNodesByIdCommand(sourceNodeId, sourceNodeName, targetNodeId, targetNodeName)
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
  exec(
    buildReparentNodesByIdCommand(nodeId, oldParentNodeId, oldAfterNodeId, newParentNodeId, afterNodeId)
      .requiresRender()
      .withAfterFocusNodeId(nodeId)
      .withAfterFocusPos(cursorPos)
      .isUndoable()
      .build()
  )
}

// charPos should be -1 to just request focus on the node
function requestFocusOnNodeAtChar (nodeId: string, charPos: number) : void {
  transientState.focusNodeId = nodeId
  transientState.focusCharPos = charPos
}

function exec (command: Command) : void {
  executeCommand(command).then(result => {
    if (result.focusNodeId) {
      requestFocusOnNodeAtChar(result.focusNodeId, result.focusPos)
    }
    if (result.renderRequired) {
      triggerTreeReload()
    }
  })
}

function triggerTreeReload () : void {
  window.dispatchEvent(new Event('treereload'))
}

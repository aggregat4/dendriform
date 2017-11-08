import * as maquette from 'maquette'
import * as repo from './repository'
import {getCursorPos, setCursorPos, isCursorAtBeginning, isCursorAtEnd, getTextBeforeCursor, getTextAfterCursor} from './util'
import {findPreviousNameNode, findNextNameNode, getParentNode, hasParentNode, getNodeId, getNodeName, isNode, hasChildren} from './tree-util.js'

const h = maquette.h

// Holds transient view state that we need to manage somehow (focus, cursor position, etc)
const transientState = {
  focusNodeId: null,
  focusCharPos: -1,
  focusNodePreviousName: null,
  focusNodePreviousPos: -1
}

// We need to support UNDO when activated anywhere in the document
document.addEventListener('keydown', globalKeyDownHandler)
// We need to track when the selection changes so we can store the current cursor position (needed for UNDO)
document.addEventListener('selectionchange', selectionChangeHandler)

function renderNode (node, first) {
  function isRoot (node) {
    return node._id === 'ROOT'
  }
  function renderChildren (children) {
    if (children && children.length > 0) {
      return [h('div.children', children.map(c => renderNode(c, false)))]
    } else {
      return []
    }
  }
  function genClass (node, isFirst) {
    return 'node' + (isRoot(node) ? ' root' : '') + (isFirst ? ' first' : '')
  }
  // TODO if there are no children in root yet, create an artifical one that is empty
  return h('div',
    { id: node._id, key: node._id + ':' + node._rev, 'data-rev': node._rev, class: genClass(node, first) },
    [
      h('a', { href: `#node=${node._id}` }, '*'),
      h('div.name', {
        // this data attribute only exists so that we can focus this node after
        // it has been created in afterCreateHandler, we would like to get it
        // from the parent but for some reason it is not there yet then
        'data-nodeid': node._id,
        contentEditable: 'true',
        onblur: nameOnBlurHandler,
        oninput: nameInputHandler,
        // the keypress event seems to be necessary to intercept (and prevent) the Enter key, input did not work
        onkeypress: nameKeypressHandler,
        onkeydown: nameKeydownHandler,
        afterCreate: transientStateHandler,
        afterUpdate: transientStateHandler
      }, node.name)
    ].concat(renderChildren(node.children)))
}

// Virtual DOM nodes need a common parent, otherwise maquette will complain, that's
// one reason why we have the toplevel div.tree
function renderTree (treeStore) {
  console.log(`renderTree call`)
  if (treeStore.status.state === 'ERROR') {
    return h('div.tree', [h('div.error', [`Can not load tree from backing store: ${treeStore.status.msg}`])])
  } else if (treeStore.status.state === 'LOADING') {
    return h('div.tree', [h('div', [`Loading tree...`])])
  } else if (treeStore.status.state === 'LOADED') {
    return h('div.tree', [renderNode(treeStore.tree, true)])
  } else {
    // TODO runtimeexception ?
    return h('div.tree', [h('div.error', [`Tree is in an unknown state`])])
  }
}

export function createTreeRenderer (treeProvider) {
  return () => { return renderTree(treeProvider()) }
}

// as per http://maquettejs.org/docs/typedoc/interfaces/_maquette_.vnodeproperties.html#aftercreate
// here we set focus to a node if it has been created and we set it as the focusable node in transientstate
function transientStateHandler (element) {
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
// actual mutating methods, but we need a valid initial value
//
// In a sane universe we would use the onfocus event on the node name to track this
// position: this would allow us to very easily set the cursor position just once on
// getting the focus in the node name. HOWEVER it appears that the onfocus event is
// faster than updating the selection and so we get stale values from that approach.
function selectionChangeHandler (event) {
  if (!transientState.focusNodePreviousName &&
      document.activeElement &&
      document.activeElement.parentNode &&
      isNode(document.activeElement.parentNode)) {
    transientState.focusNodePreviousName = getNodeName(document.activeElement.parentNode)
    transientState.focusNodePreviousPos = getCursorPos(document.activeElement)
  }
}

// In order for our cusor position saving approach in "selectionChangeHandler" to
// work, we need to make sure that the values are reset when we leave the node name
function nameOnBlurHandler (event) {
  transientState.focusNodePreviousName = null
  transientState.focusNodePreviousPos = -1
}

function nameInputHandler (event) {
  const nodeId = event.target.parentNode.getAttribute('id')
  const newName = event.target.textContent || ''
  const oldName = transientState.focusNodePreviousName
  const beforeFocusNodeId = nodeId
  const beforeFocusPos = transientState.focusNodePreviousPos
  transientState.focusNodePreviousName = newName
  transientState.focusNodePreviousPos = getCursorPos(event.target)
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
function nameKeypressHandler (event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    const nodeId = event.target.parentNode.getAttribute('id')
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
function nameKeydownHandler (event) {
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    const previousNode = findPreviousNameNode(event.target)
    if (previousNode) {
      previousNode.focus()
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    const nextNode = findNextNameNode(event.target)
    if (nextNode) {
      nextNode.focus()
    }
  } else if (event.key === 'Backspace') {
    if (isCursorAtBeginning(event) && event.target.parentNode.previousSibling) {
      event.preventDefault()
      const sourceNode = event.target.parentNode
      const targetNode = sourceNode.previousSibling
      mergeNodes(sourceNode, targetNode)
    }
  } else if (event.key === 'Delete') {
    if (isCursorAtEnd(event) && event.target.parentNode.nextSibling) {
      event.preventDefault()
      const targetNode = event.target.parentNode
      const sourceNode = targetNode.nextSibling
      mergeNodes(sourceNode, targetNode)
    }
  } else if (event.key === 'Tab' && !event.shiftKey) {
    // When tabbing you want to make the node the last child of the previous sibling (if it exists)
    const node = event.target.parentNode
    if (node.previousSibling) {
      event.preventDefault()
      // when a node is a child, it is inside a "children" container of its parent
      const oldParentNode = getParentNode(node)
      const newParentNode = node.previousSibling
      reparentNode(node, getCursorPos(event.target), oldParentNode, newParentNode)
    }
  } else if (event.key === 'Tab' && event.shiftKey) {
    // When shift-Tabbing the node should become the next sibling of the parent node (if it exists)
    // Caution: we only allow unindent if the current node has a parent and a grandparent node, otherwise we can not unindent
    const node = event.target.parentNode
    if (hasParentNode(node)) {
      const oldParentNode = getParentNode(node)
      if (hasParentNode(oldParentNode)) {
        const newParentNode = getParentNode(oldParentNode)
        const afterNode = oldParentNode
        event.preventDefault()
        reparentNodeAfter(node, getCursorPos(event.target), oldParentNode, newParentNode, afterNode)
      }
    }
  }
}

function globalKeyDownHandler (event) {
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
function mergeNodes (sourceNode, targetNode) {
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

function reparentNode (node, cursorPos, oldParentNode, newParentNode) {
  reparentNodeAfter(node, cursorPos, oldParentNode, newParentNode, null)
}

function reparentNodeAfter (node, cursorPos, oldParentNode, newParentNode, afterNode) {
  const nodeId = getNodeId(node)
  const oldAfterNodeId = node.previousSibling ? getNodeId(node.previousSibling) : null
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

function triggerTreeReload () {
  window.dispatchEvent(new window.Event('treereload'))
}

// charPos should be -1 to just request focus on the node
function requestFocusOnNodeAtChar (nodeId, charPos) {
  transientState.focusNodeId = nodeId
  transientState.focusCharPos = charPos
}

const UNDO_BUFFER = []
const REDO_BUFFER = []

class CommandBuilder {
  constructor (fn) {
    this.fn = fn
  }

  requiresRender () {
    this.renderRequired = true
    return this
  }

  withBeforeFocusNodeId (beforeFocusNodeId) {
    this.beforeFocusNodeId = beforeFocusNodeId
    return this
  }

  withBeforeFocusPos (beforeFocusPos) {
    this.beforeFocusPos = beforeFocusPos
    return this
  }

  withAfterFocusNodeId (afterFocusNodeId) {
    this.afterFocusNodeId = afterFocusNodeId
    return this
  }

  withAfterFocusPos (afterFocusPos) {
    this.afterFocusPos = afterFocusPos
    return this
  }

  isUndoable () {
    this.undoable = true
    return this
  }

  build () {
    return new Command(
      this.fn,
      this.renderRequired || false,
      this.beforeFocusNodeId || null,
      this.beforeFocusPos || -1,
      this.afterFocusNodeId || null,
      this.afterFocusPos || -1,
      this.undoable || false
    )
  }
}

class Command {
  constructor (fn, renderRequired, beforeFocusNodeId, beforeFocusPos, afterFocusNodeId, afterFocusPos, undoable) {
    this.fn = fn
    this.renderRequired = renderRequired
    this.beforeFocusNodeId = beforeFocusNodeId
    this.beforeFocusPos = beforeFocusPos
    this.afterFocusNodeId = afterFocusNodeId
    this.afterFocusPos = afterFocusPos
    this.undoable = undoable
  }
}

function executeCommand (command) {
  console.log(`executing command: ${JSON.stringify(command)}`)
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
        console.log(`storing UNDO command: ${JSON.stringify(undoCommands)}`)
        UNDO_BUFFER.push(...undoCommands)
      }
    })
    .then(() => command.undoable && REDO_BUFFER.push(command))
    .then(() => command.afterFocusNodeId && requestFocusOnNodeAtChar(command.afterFocusNodeId, command.afterFocusPos))
    .then(() => command.renderRequired && triggerTreeReload())
}

// 1. rename the current node to the right hand side of the split
// 2. insert a new sibling BEFORE the current node containing the left hand side of the split
function splitNodeById (nodeId, beforeSplitNamePart, afterSplitNamePart) {
  return repo.renameNode(nodeId, afterSplitNamePart)
    .then((result) => repo.createSiblingBefore(beforeSplitNamePart, null, nodeId))
    .then((newSiblingRepoNode) => ([
      new CommandBuilder(() => mergeNodesById(newSiblingRepoNode._id, afterSplitNamePart, nodeId, beforeSplitNamePart)).requiresRender().build()
    ]))
}

// 1. rename targetnode to be targetnode.name + sourcenode.name
// 2. move all children of sourcenode to targetnode (actual move, just reparent)
// 3. delete sourcenode
// 4. focus the new node at the end of its old name
//
// For the undo it is assumed that a merge never happens to a target node with children
// This function will not undo the merging of the child collections (this mirrors workflowy
// maybe we want to revisit this in the future)
function mergeNodesById (sourceNodeId, sourceNodeName, targetNodeId, targetNodeName) {
  return repo.getChildNodes(sourceNodeId)
    .then(children => repo.reparentNodes(children, targetNodeId))
    .then(() => repo.renameNode(targetNodeId, targetNodeName + sourceNodeName))
    .then(() => repo.deleteNode(sourceNodeId))
    .then(() => ([
      new CommandBuilder(() => splitNodeById(targetNodeId, targetNodeName, sourceNodeName))
        .requiresRender()
        .build()
    ]))
}

function renameNodeById (nodeId, oldName, newName) {
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
function reparentNodesById (nodeId, oldParentNodeId, oldAfterNodeId, newParentNodeId, afterNodeId) {
  return repo.getNode(nodeId)
    .then(node => repo.reparentNodes([node], newParentNodeId, afterNodeId))
    .then(() => ([
      new CommandBuilder(() => reparentNodesById(nodeId, newParentNodeId, null, oldParentNodeId, oldAfterNodeId))
        .requiresRender()
        .build()
    ]))
}

import * as maquette from 'maquette'
import * as repo from './repository'
import {debounce} from './util'

const h = maquette.h
// The rename handler needs to be debounced so that we do not overload pouchdb.
// With fast typing this would otherwise lead to document update conflicts and unnecessary load on the db.
const debouncedRenameHandler = debounce(handleRename, 500)
// Holds transient view state that we need to manage somehow (focus, cursor position, etc)
const transientState = {
  focusNodeId: null,
  focusCharPos: -1
}

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
    { id: node._id, key: node._id, 'data-rev': node._rev, class: genClass(node, first) },
    [
      h('a', { href: `#node=${node._id}` }, '*'),
      h('div.name', {
        // this data attribute only exists so that we can focus this node after
        // it has been created in afterCreateHandler, we would like to get it
        // from the parent but for some reason it is not there yet then
        'data-nodeid': node._id,
        contentEditable: 'true',
        oninput: debouncedRenameHandler,
        // the keypress event seems to be necessary to intercept (and prevent) the Enter key, input did not work
        onkeypress: nameKeypressHandler,
        onkeydown: nameKeydownHandler,
        afterCreate: transientStateHandler,
        afterUpdate: transientStateHandler
      }, node.name)
    ].concat(renderChildren(node.children)))
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

// NOTE this assumes that the element has only one textContent child as child 0, no rich content!
function setCursorPos (el, charPos) {
  const range = document.createRange()
  range.setStart(el.childNodes[0], charPos)
  range.setEnd(el.childNodes[0], charPos)
  // range.collapse(true)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
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

function handleRename (event) {
  const nodeId = event.target.parentNode.getAttribute('id')
  const newName = event.target.textContent || ''
  renameNode(nodeId, newName)
  // No need to trigger a reload sine the rename is already happening in place
}

/*
  NOTE from the MDN docs: "The keypress event is fired when a key is pressed down and
  that key normally produces a character value"
*/
function nameKeypressHandler (event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    handleSplit(event)
  }
}

/*
function getNodeChildIds (node) {
  const childIds = []
  if (node.childNodes.length > 2) {
    // children are under a specific div.children
    const children = node.childNodes[2].childNodes
    for (var i = 0; i < children.length; i++) {
      childIds.push(children[i].getAttribute('id'))
    }
  }
  return childIds
}
*/

function isCursorAtEnd (kbdevent) {
  return getCursorPos() === kbdevent.target.textContent.length
}

function isCursorAtBeginning (kbdevent) {
  return getCursorPos() === 0
}

function getCursorPos () {
  const selection = window.getSelection()
  if (selection.rangeCount) {
    const selectionRange = selection.getRangeAt(0)
    return selectionRange.endOffset
  } else {
    return -1
  }
}

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
    // TODO check if we are at the end of the node, if so merge with next sibling
    if (isCursorAtEnd(event) && event.target.parentNode.nextSibling) {
      event.preventDefault()
      const targetNode = event.target.parentNode
      const sourceNode = targetNode.nextSibling
      mergeNodes(sourceNode, targetNode)
    }
  }
}

function findPreviousNameNode (node) {
  // TODO add search for OPEN nodes, not just any node
  const parentNode = node.parentNode
  if (parentNode.previousSibling) {
    const lastChildNode = findLastChildNode(parentNode.previousSibling)
    return lastChildNode.childNodes[1]
  } else if (parentNode.parentNode && parentNode.parentNode.getAttribute('class') === 'children') {
    // parentNode = div.node, parentNode.parentNode = div.children, parentNode.parentNode.parentNode = the real parent div.node
    return parentNode.parentNode.parentNode.childNodes[1]
  } else {
    return null
  }
}

// Given a div.node it finds the LAST and deepest child (depth first) of that node, or the node itself
function findLastChildNode (node) {
  if (node.childNodes.length > 2) {
    const childrenNode = node.childNodes[2]
    return findLastChildNode(childrenNode.childNodes[childrenNode.childNodes.length - 1])
  } else {
    return node
  }
}

function findNextNameNode (node) {
  // TODO make this more clever, see workflowy, in this case we just need to add the search for OPEN nodes
  const parentNode = node.parentNode
  if (parentNode.childNodes.length > 2) {
    // parentNode = div.node, parentNode.childNodes[2] = div.children, and then the first child's name node
    return parentNode.childNodes[2].childNodes[0].childNodes[1]
  } else if (parentNode.nextSibling) {
    return parentNode.nextSibling.childNodes[1]
  } else {
    const firstAncestorNextSibling = findFirstAncestorNextSibling(parentNode)
    if (firstAncestorNextSibling) {
      return firstAncestorNextSibling.childNodes[1]
    } else {
      return null
    }
  }
}

// Assuming we get passed a div.node this function will find the first
// next-sibling of an ancestor node and return it (div.node) or null if
// none could be found
function findFirstAncestorNextSibling (node) {
  if (node.parentNode && node.parentNode.getAttribute('class') === 'children') {
    const parentNode = node.parentNode.parentNode
    if (parentNode.getAttribute('id') === 'ROOT') {
      return null
    } else {
      if (parentNode.nextSibling) {
        return parentNode.nextSibling
      } else {
        return findFirstAncestorNextSibling(parentNode)
      }
    }
  } else {
    return null
  }
}

function handleSplit (kbdevent) {
  const selection = window.getSelection()
  // if there is a selection at all (including just a cursor), this should basically always be true since we are in a contenteditable and we pressed Enter
  if (selection.rangeCount) {
    const selectionRange = selection.getRangeAt(0)
    const rangeBeforeCursor = selectionRange.cloneRange()
    rangeBeforeCursor.selectNodeContents(kbdevent.target)
    rangeBeforeCursor.setEnd(selectionRange.endContainer, selectionRange.endOffset)
    // console.log(`range before cursor '${rangeBeforeCursor.toString()}'`);
    const rangeAfterCursor = selectionRange.cloneRange()
    rangeAfterCursor.selectNodeContents(kbdevent.target)
    rangeAfterCursor.setStart(selectionRange.endContainer, selectionRange.endOffset)
    // console.log(`range after cursor '${rangeAfterCursor.toString()}'`);
    const nodeId = kbdevent.target.parentNode.getAttribute('id')
    // const nodeRev = kbdevent.target.parentNode.getAttribute('data-rev')
    const updatedNodeName = rangeBeforeCursor.toString()
    const newSiblingNodeName = rangeAfterCursor.extractContents().textContent
    splitNode(nodeId, updatedNodeName, newSiblingNodeName)
  }
}

function triggerTreeReload () {
  window.dispatchEvent(new window.Event('treereload'))
}

// --------- Some functions that represent higher level actions on nodes, separate from dom stuff

function requestFocusOnNode (nodeId) {
  transientState.focusNodeId = nodeId
  transientState.focusCharPos = -1
}

function requestFocusOnNodeAtChar (nodeId, charPos) {
  transientState.focusNodeId = nodeId
  transientState.focusCharPos = charPos
}

function splitNode (nodeId, updatedNodeName, newSiblingNodeName) {
  // console.log(`Splitting node with id '${nodeId}' with new name '${updatedNodeName}' and new sibling '${newSiblingNodeName}'`)
  Promise.all([
    repo.renameNode(nodeId, updatedNodeName),
    repo.createSibling(newSiblingNodeName, null, nodeId)
      .then(newSibling => requestFocusOnNode(newSibling._id))
  ]).then(triggerTreeReload)
}

// 1. rename targetnode to be targetnode.name + sourcenode.name
// 2. move all children of sourcenode to targetnode (actual move, just reparent)
// 3. delete sourcenode
// 4. focus the new node at the end of its old name
function mergeNodesById (sourceNodeId, sourceNodeName, targetNodeId, targetNodeName) {
  repo.getChildNodes(sourceNodeId)
    .then(children => {
      return Promise.all([
        repo.renameNode(targetNodeId, targetNodeName + sourceNodeName),
        repo.reparentNodes(children, targetNodeId),
        repo.deleteNode(sourceNodeId)
      ])
    })
    .then(() => requestFocusOnNodeAtChar(targetNodeId, Math.max(0, targetNodeName.length)))
    .then(triggerTreeReload)
}

// Helper function that works on Nodes, it extracts the ids and names, and then delegates to the other mergenodes
function mergeNodes (sourceNode, targetNode) {
  const sourceNodeId = sourceNode.getAttribute('id')
  const sourceNodeName = sourceNode.children[1].textContent || ''
  const targetNodeId = targetNode.getAttribute('id')
  const targetNodeName = targetNode.children[1].textContent || ''
  mergeNodesById(sourceNodeId, sourceNodeName, targetNodeId, targetNodeName)
}

function renameNode (nodeId, newName) {
  repo.renameNode(nodeId, newName)
}

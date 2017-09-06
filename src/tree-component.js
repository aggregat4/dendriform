import * as maquette from 'maquette'
import * as repo from './repository'
import {debounce} from './util'

const h = maquette.h
// The rename handler needs to be debounced so that we do not overload pouchdb.
// With fast typing this would otherwise lead to document update conflicts and unnecessary load on the db.
const debouncedRenameHandler = debounce(handleRename, 500)
// Holds transient view state that we need to manage somehow (focus, cursor position, etc)
const transientState = {
  focusNodeId: null
}

function renderNode (node) {
  function renderChildren (children) {
    if (children && children.length > 0) {
      return [h('div.children', children.map(c => renderNode(c)))]
    } else {
      return []
    }
  }
  return h('div.node',
    { id: node._id, key: node._id, 'data-rev': node._rev },
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
        afterCreate: afterCreateHandler
      }, node.name)
    ].concat(renderChildren(node.children)))
}

// as per http://maquettejs.org/docs/typedoc/interfaces/_maquette_.vnodeproperties.html#aftercreate
// here we set focus to a node if it has been created and we set it as the focusable node in transientstate
function afterCreateHandler (element) {
  if (transientState && transientState.focusNodeId && element.getAttribute('data-nodeid') === transientState.focusNodeId) {
    element.focus()
    transientState.focusNodeId = null
  }
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
    return h('div.tree', [renderNode(treeStore.tree)])
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
  repo.renameNode(nodeId, newName)
  // No need to trigger a reload sine the rename is already happening in place
}

function nameKeypressHandler (event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    handleSplit(event)
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
  }
}

function findPreviousNameNode (node) {
  // TODO: workflowy is a bit cleverer here: it actually finds the lowermost open node before the current node
  // This means that we would need to do a depth first search in the previous sibling for the first open node working backwards (last child first)
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
    console.log(`Splitting node with id '${nodeId}' with new name '${updatedNodeName}' and new sibling '${newSiblingNodeName}'`)
    // kbdevent.target.blur()
    Promise.all([
      repo.renameNode(nodeId, updatedNodeName),
      repo.createSibling(newSiblingNodeName, null, nodeId)
        .then(newSibling => {
          transientState.focusNodeId = newSibling._id
        })
    ]).then(triggerTreeReload)
  }
}

function triggerTreeReload () {
  window.dispatchEvent(new window.Event('treereload'))
}

import * as maquette from 'maquette'
import * as repo from './repository'

const h = maquette.h

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
      h('div.name', { contentEditable: 'true', oninput: handleRename, onkeyup: possiblyHandleSplit }, node.name)
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

function possiblyHandleSplit (kbdevent) {
  if (kbdevent.key === 'Enter') {
    kbdevent.preventDefault()
    handleSplit(kbdevent)
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
    Promise.all([
      repo.renameNode(nodeId, updatedNodeName),
      repo.createSibling(newSiblingNodeName, null, nodeId)
    ]).then(triggerTreeReload)
  }
}

function triggerTreeReload () {
  window.dispatchEvent(new window.Event('treereload'))
}

import * as maquette from 'maquette'

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
    { key: node._id, 'data-rev': node._rev },
    [
      h('a', { href: `#node=${node._id}` }, '*'),
      h('div.name', { contentEditable: 'true' }, node.name)
    ].concat(renderChildren(node.children)))
}

// Virtual DOM nodes need a common parent, otherwise maquette will complain, that's
// one reason why we have the toplevel div.tree
function renderTree (treeStore) {
   // TODO runtimeexception
  console.log(`rendering a tree: ${JSON.stringify(treeStore)}`)
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

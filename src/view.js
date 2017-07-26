import * as maquette from 'maquette'

const h = maquette.h

function render (node) {
   // TODO potentially deal with non existant tree in renderer
  console.log(`got a tree: ${JSON.stringify(node)}`)
  function renderChildren (children) {
    if (children && children.length > 0) {
      return [h('div.children', children.map(c => render(c)))]
    } else {
      return []
    }
  }
  return h('div.node',
    { id: node._id, 'data-rev': node._rev },
    [
      h('a', { href: `#node=${node._id}` }, '*'),
      h('div.name', { contentEditable: 'true' }, node.name)
    ].concat(renderChildren(node.children)))
}

export function createTreeRenderer (treeProvider) {
  return () => { return render(treeProvider()) }
}

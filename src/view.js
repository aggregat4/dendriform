import * as maquette from 'maquette'

const h = maquette.h

function render(tree) {
  console.log(`got a tree: ${JSON.stringify(tree)}`)
  return h('span', [
    h('h2', ['This is the sub heading, really.']),
    h('h3', ['Tree this'])
  ])
}

export function createTreeRenderer(tree) {
  return () => { return render(tree) }
}

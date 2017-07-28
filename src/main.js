import * as maquette from 'maquette'
import {getHashValue} from './util'
import * as store from './store'
import * as view from './view'

const projector = maquette.createProjector()
const STORE = {
  status: {
    state: 'LOADING'
  }
}

// Initially trigger a load of the store (async) so we have something to display ASAP
loadStore()

// ---- domain specific utility functions
function getRequestedNodeId () {
  return getHashValue('node') || 'ROOT'
}

function loadStore () {
  store.loadTree(getRequestedNodeId())
    .then((tree) => {
      console.log(`Tree was loaded, now store is: ${JSON.stringify(tree)}`)
      STORE.tree = tree
      STORE.status.state = 'LOADED'
      projector.scheduleRender()
    })
    .catch((reason) => {
      STORE.tree = {}
      STORE.status.state = 'ERROR'
      STORE.status.msg = `Error loading tree: ${reason}`
      console.log(`Error loading tree: ${reason}`)
    })
}

// NEVER FORGET TO DEFER DOM INITIALISATION STUFF UNTIL THE DOM IS LOADED
// YOU TWAT
document.addEventListener('DOMContentLoaded', () => {
  projector.append(
    document.querySelector('#treething'),
    view.createTreeRenderer(() => STORE))
})

window.addEventListener('hashchange', loadStore)

import * as maquette from 'maquette'
import {getHashValue} from './util'
import * as store from './store'
import * as view from './view'

const projector = maquette.createProjector()
const STORE = {}

loadStore()

// ---- domain specific utility functions
function getRequestedNodeId () {
  console.log('hashnodevalue: ' + getHashValue('node'))
  return getHashValue('node') || 'ROOT'
}

function loadStore () {
  store.loadTree(getRequestedNodeId())
    .then((tree) => {
      STORE.tree = tree
      projector.scheduleRender()
    })
    .catch((reason) => {
      console.log(`Error loading and rendering tree: ${reason}`)
    })
}

// NEVER FORGET TO DEFER DOM INITIALISATION STUFF UNTIL THE DOM IS LOADED
// YOU TWAT
document.addEventListener('DOMContentLoaded', () => {
  projector.append(
    document.querySelector('#treething'),
    view.createTreeRenderer(() => STORE.tree))
})

window.addEventListener('hashchange', () => {
  loadStore()
})

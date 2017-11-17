import * as maquette from 'maquette'
import {getHashValue} from './util'
import * as repository from './repository'
import * as treecomponent from './tree-component'

const projector = maquette.createProjector()

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
  tree: any
}

const STORE = {
  status: {
    state: 'LOADING',
    msg: undefined
  },
  tree: {}
}

// Initially trigger a load of the store (async) so we have something to display ASAP
loadStore()

// ---- domain specific utility functions
function getRequestedNodeId () : string {
  return getHashValue('node') || 'ROOT'
}

function loadStore () : void {
  repository.loadTree(getRequestedNodeId())
    .then((tree) => {
      // console.log(`Tree was loaded, now store is: ${JSON.stringify(tree)}`)
      console.log(`Tree was loaded`)
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
    treecomponent.createTreeRenderer(() => STORE))
})

window.addEventListener('hashchange', loadStore)
// The 'treereload' event is custom and can be triggered in some component to indicate that the store needs to be reloaded (and rerendered)
window.addEventListener('treereload', loadStore)

import {createProjector} from 'maquette'
import {getHashValue} from './util'
import * as treecomponent from './tree-component'

const projector = createProjector()

function getRequestedNodeId () : string {
  return getHashValue('node') || 'ROOT'
}

// Initially trigger a load of the store (async) so we have something to display ASAP
reload()

function reload () : void {
  treecomponent.load(getRequestedNodeId())
    .then(status => {
      console.log(`Tree was loaded`)
      projector.scheduleRender()
    })
}

// NEVER FORGET TO DEFER DOM INITIALISATION STUFF UNTIL THE DOM IS LOADED
// YOU TWAT
document.addEventListener('DOMContentLoaded', () => {
  projector.append(
    document.querySelector('#treething'),
    treecomponent.render)
})

window.addEventListener('hashchange', reload)
// The 'treereload' event is custom and can be triggered in a component to indicate
// that the store needs to be reloaded (and rerendered)
window.addEventListener('treereload', reload)

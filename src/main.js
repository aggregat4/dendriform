import * as maquette from 'maquette';
import {isEmpty, getHashValue} from './util';

const h = maquette.h;
const projector = maquette.createProjector();



// ---- domain specific utility functions
function getRequestedNodeId() {
  const requestedNode = getHashValue('node');
  return requestedNode || 'ROOT';
}


function render() {
  return h('h2', ['This is the sub heading, really.']);
}

// NEVER FORGET TO DEFER DOM INITIALISATION STUFF UNTIL THE DOM IS LOADED
// YOU TWAT
document.addEventListener('DOMContentLoaded', () => {
  projector.append(document.querySelector('#treething'), render);
});

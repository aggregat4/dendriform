import {getHashValue} from './util'
import {el, mount} from 'redom'

function getRequestedNodeId() {
  return getHashValue('node') || 'ROOT'
}

class Tree {
  constructor(loadedTree) {
    this.el = el('div.tree',
      tree.status.state === State.ERROR && this.error = el('div.error', `Can not load tree from backing store: ${tree.status.msg}`),
      tree.status.state === State.LOADING && this.error = el('div.error', `Loading tree...`),
      tree.status.state === State.LOADED && this.root = new TreeNode(tree.tree)
    )
  }
  update(loadedTree) {

  }
}

class TreeNode {
  constructor(treeNode) {
    
  }
}

/*

import * as treecomponent from './tree-component'

const projector = createProjector()

// Initially trigger a load of the store (async) so we have something to display ASAP
navigateAndReload()
// Trigger a reload when the URL changes (the hash part)
window.addEventListener('hashchange', navigateAndReload)
// The 'treereload' event is custom and can be triggered in a component to indicate
// that the store needs to be reloaded (and rerendered)
window.addEventListener('treereload', justReload)

function navigateAndReload(): void {
  reload(true)
}

function justReload(): void {
  reload(false)
}

function reload(hasNavigated): void {
  treecomponent.load(getRequestedNodeId(), !!hasNavigated)
    .then(() => {
      // tslint:disable-next-line:no-console
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
*/
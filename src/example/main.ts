import {TreeManager} from '../ts/tree'

function getHashValue(key: string): string {
  const matches = window.location.hash.match(RegExp.exec(`${key}=([^&]*)?`))
  return matches && matches.length >= 2 ? matches[1] : null
}

function getRequestedNodeId() {
  return getHashValue('node') || 'ROOT'
}

const treeManager = new TreeManager()

function init() {
  treeManager.getAvailableTrees()
    .then(trees => treeManager.mountTree(document.body, trees[0]))
    .then(() => treeManager.loadNode(getRequestedNodeId()))
}

// if we are already loaded then DOMContentLoaded will not fire again, just init
if (document.readyState !== 'loading') {
  init()
} else {
  document.addEventListener('DOMContentLoaded', init)
}

window.addEventListener('hashchange', () => treeManager.loadNode(getRequestedNodeId()))

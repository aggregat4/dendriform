import { TreeManager } from '../ts/tree'

function getHashValue(key: string): string {
  const matches = RegExp(`${key}=([^&]*)?`).exec(window.location.hash)
  return matches && matches.length >= 2 ? matches[1] : null
}

function getRequestedNodeId() {
  return getHashValue('node') || 'ROOT'
}

function getDocumentUrlParam() {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('document')
}

const treeManager = new TreeManager()

const defaultDocument = 'dendriform-eventlog'

function init() {
  const documentToOpen = getDocumentUrlParam() || defaultDocument
  // we can't do toplevel await and it doesn't matter here anyway
  // this is the top of the stack, this initialization should run async
  void treeManager
    .mountTree(document.body, documentToOpen)
    .then(() => treeManager.loadNode(getRequestedNodeId()))
}

// if we are already loaded then DOMContentLoaded will not fire again, just init
if (document.readyState !== 'loading') {
  init()
} else {
  document.addEventListener('DOMContentLoaded', init)
}

window.addEventListener('hashchange', () => {
  void treeManager.loadNode(getRequestedNodeId())
})

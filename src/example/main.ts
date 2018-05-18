import {initTree, updateTree} from '../ts/tree'

function getHashValue(key: string): string {
  const matches = window.location.hash.match(new RegExp(`${key}=([^&]*)?`))
  return matches && matches.length >= 2 ? matches[1] : null
}

function getRequestedNodeId() {
  return getHashValue('node') || 'ROOT'
}

initTree(document.body, getRequestedNodeId())
updateTree(getRequestedNodeId())

// Trigger a reload when the URL changes (the hash part)
window.addEventListener('hashchange', () => updateTree(getRequestedNodeId()))

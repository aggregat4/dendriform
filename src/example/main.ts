import {updateTree, mountTree} from '../ts/tree'

function getHashValue(key: string): string {
  const matches = window.location.hash.match(new RegExp(`${key}=([^&]*)?`))
  return matches && matches.length >= 2 ? matches[1] : null
}

function getRequestedNodeId() {
  return getHashValue('node') || 'ROOT'
}

document.addEventListener('DOMContentLoaded', () => {
  mountTree(document.body)
  updateTree(getRequestedNodeId())
})

window.addEventListener('hashchange', () => updateTree(getRequestedNodeId()))

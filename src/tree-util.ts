// DOM Utilities for working with Node Elements and its structure

// Checks whether the current node has a parent that is NOT ROOT
export function hasParentNode (node: HTMLElement) : boolean {
  if (node.parentNode &&
      (node.parentNode as HTMLElement).classList.contains('children') &&
      isNode(node.parentNode.parentNode as HTMLElement)) {
    return true
  } else {
    return false
  }
}

function isRootNode (node: HTMLElement) : boolean {
  return getNodeId(node) === 'ROOT'
}

export function isNode (element: HTMLElement) : boolean {
  return element.classList.contains('node')
}

// TODO should we fail fast here by throwing exception after checking hasParentNode?
export function getParentNode (node: HTMLElement) : HTMLElement {
  // first parentNode is div.children, its parent is the real parent node
  return node.parentNode.parentNode as HTMLElement
}

export function hasChildren (node: HTMLElement) : boolean {
  return (
    node.childNodes.length > 2 &&
    (node.childNodes[2] as HTMLElement).classList.contains('children') &&
    node.childNodes[2].childNodes.length > 0
  )
}

// TODO this is very fragile, it actually returns a name node? where is this used?
export function findPreviousNameNode (nodeNameElement: HTMLElement) : HTMLElement {
  // TODO add search for OPEN nodes, not just any node
  const node = nodeNameElement.parentNode
  if (node.previousSibling) {
    const lastChildNode = findLastChildNode(node.previousSibling as HTMLElement)
    return lastChildNode.childNodes[1] as HTMLElement
  } else if (node.parentNode && (node.parentNode as HTMLElement).classList.contains('children')) {
    // parentNode = div.node, node.parentNode = div.children, node.parentNode.parentNode = the real parent div.node
    return ((node.parentNode as HTMLElement).parentNode as HTMLElement).childNodes[1] as HTMLElement
  } else {
    return null
  }
}

// Given a div.node it finds the LAST and deepest child (depth first) of that node, or the node itself
function findLastChildNode (node: HTMLElement) : HTMLElement {
  if (node.childNodes.length > 2) {
    const childrenNode : HTMLElement = node.childNodes[2] as HTMLElement
    return findLastChildNode(childrenNode.childNodes[childrenNode.childNodes.length - 1] as HTMLElement)
  } else {
    return node
  }
}

export function findNextNameNode (node: HTMLElement) : HTMLElement {
  // TODO make this more clever, see workflowy, in this case we just need to add the search for OPEN nodes
  const parentNode : HTMLElement = node.parentNode as HTMLElement
  if (parentNode.childNodes.length > 2) {
    // parentNode = div.node, parentNode.childNodes[2] = div.children, and then the first child's name node
    return parentNode.childNodes[2].childNodes[0].childNodes[1] as HTMLElement
  } else if (parentNode.nextSibling) {
    return parentNode.nextSibling.childNodes[1] as HTMLElement
  } else {
    const firstAncestorNextSibling = findFirstAncestorNextSibling(parentNode)
    if (firstAncestorNextSibling) {
      return firstAncestorNextSibling.childNodes[1] as HTMLElement
    } else {
      return null
    }
  }
}

// Assuming we get passed a div.node this function will find the first
// next-sibling of an ancestor node and return it (div.node) or null if
// none could be found
function findFirstAncestorNextSibling (node: HTMLElement) : HTMLElement {
  if (node.parentNode && (node.parentNode as HTMLElement).classList.contains('children')) {
    const parentNode : HTMLElement = node.parentNode.parentNode as HTMLElement
    if (isRootNode(parentNode)) {
      return null
    } else {
      if (parentNode.nextSibling) {
        return parentNode.nextSibling as HTMLElement
      } else {
        return findFirstAncestorNextSibling(parentNode)
      }
    }
  } else {
    return null
  }
}

export function getNodeId (node: HTMLElement) : string {
  return node.getAttribute('id')
}

export function getNodeName (node: HTMLElement) : String {
  return node.children[1].textContent || ''
}

/*
function getNodeChildIds (node) {
  const childIds = []
  if (node.childNodes.length > 2) {
    // children are under a specific div.children
    const children = node.childNodes[2].childNodes
    for (var i = 0; i < children.length; i++) {
      childIds.push(children[i].getAttribute('id'))
    }
  }
  return childIds
}
*/

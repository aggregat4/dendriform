// DOM Utilities for working with Node Elements and its structure

// Checks whether the current node has a parent that is NOT ROOT
export function hasParentNode (node) {
  if (node.parentNode &&
      node.parentNode.getAttribute('class').indexOf('children') !== -1 &&
      isNode(node.parentNode.parentNode)) {
    return true
  } else {
    return false
  }
}

function isRootNode (node) {
  return getNodeId(node) === 'ROOT'
}

export function isNode (element) {
  const classAttribute = element.getAttribute('class')
  return (classAttribute &&
          classAttribute.indexOf('node') !== -1)
}

// TODO should we fail fast here by throwing exception after checking hasParentNode?
export function getParentNode (node) {
  // first parentNode is div.children, its parent is the real parent node
  return node.parentNode.parentNode
}

export function hasChildren (node) {
  return (
    node.childNodes.length > 2 &&
    node.childNodes[2].getAttribute('class').indexOf('children') !== -1 &&
    node.childNodes[2].childNodes.length > 0
  )
}

export function findPreviousNameNode (node) {
  // TODO add search for OPEN nodes, not just any node
  const parentNode = node.parentNode
  if (parentNode.previousSibling) {
    const lastChildNode = findLastChildNode(parentNode.previousSibling)
    return lastChildNode.childNodes[1]
  } else if (parentNode.parentNode && parentNode.parentNode.getAttribute('class') === 'children') {
    // parentNode = div.node, parentNode.parentNode = div.children, parentNode.parentNode.parentNode = the real parent div.node
    return parentNode.parentNode.parentNode.childNodes[1]
  } else {
    return null
  }
}

// Given a div.node it finds the LAST and deepest child (depth first) of that node, or the node itself
function findLastChildNode (node) {
  if (node.childNodes.length > 2) {
    const childrenNode = node.childNodes[2]
    return findLastChildNode(childrenNode.childNodes[childrenNode.childNodes.length - 1])
  } else {
    return node
  }
}

export function findNextNameNode (node) {
  // TODO make this more clever, see workflowy, in this case we just need to add the search for OPEN nodes
  const parentNode = node.parentNode
  if (parentNode.childNodes.length > 2) {
    // parentNode = div.node, parentNode.childNodes[2] = div.children, and then the first child's name node
    return parentNode.childNodes[2].childNodes[0].childNodes[1]
  } else if (parentNode.nextSibling) {
    return parentNode.nextSibling.childNodes[1]
  } else {
    const firstAncestorNextSibling = findFirstAncestorNextSibling(parentNode)
    if (firstAncestorNextSibling) {
      return firstAncestorNextSibling.childNodes[1]
    } else {
      return null
    }
  }
}

// Assuming we get passed a div.node this function will find the first
// next-sibling of an ancestor node and return it (div.node) or null if
// none could be found
function findFirstAncestorNextSibling (node) {
  if (node.parentNode && node.parentNode.getAttribute('class') === 'children') {
    const parentNode = node.parentNode.parentNode
    if (isRootNode(parentNode)) {
      return null
    } else {
      if (parentNode.nextSibling) {
        return parentNode.nextSibling
      } else {
        return findFirstAncestorNextSibling(parentNode)
      }
    }
  } else {
    return null
  }
}

export function getNodeId (node) {
  return node.getAttribute('id')
}

export function getNodeName (node) {
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

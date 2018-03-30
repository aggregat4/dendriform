// DOM Utilities for working with Node Elements and its structure

// Checks whether the current node has a parent that is NOT ROOT
export function hasParentNode(node: Element): boolean {
  if (node.parentElement &&
      node.parentElement.classList.contains('children') &&
      isNode(node.parentElement.parentElement)) {
    return true
  } else {
    return false
  }
}

function isRootNode(node: Element): boolean {
  return getNodeId(node) === 'ROOT'
}

export function isNode(element: Element): boolean {
  return element.classList.contains('node')
}

export function isNameNode(el: Element): boolean {
  return el.classList.contains('name')
}

// TODO should we fail fast here by throwing exception after checking hasParentNode?
export function getParentNode(node: Element): Element {
  // first parentElement is div.children, its parent is the real parent node
  return node.parentElement.parentElement
}

export function hasChildren(node: Element): boolean {
  return (
    node.children.length > 2 &&
    node.children[2].classList.contains('children') &&
    node.children[2].children.length > 0
  )
}

// TODO this is very fragile, it actually returns a name node? where is this used?
export function findPreviousNameNode(nodeNameElement: Element): Element {
  // TODO add search for OPEN nodes, not just any node
  const node: Element = nodeNameElement.parentElement
  if (node.previousSibling) {
    const lastChildNode = findLastChildNode(node.previousElementSibling)
    return lastChildNode.children[1]
  } else if (node.parentElement && node.parentElement.classList.contains('children')) {
    // parentElement = div.node, node.parentElement = div.children,
    // node.parentElement.parentElement = the real parent div.node
    return node.parentElement.parentElement.children[1]
  } else {
    return null
  }
}

// Given a div.node it finds the LAST and deepest child (depth first) of that node, or the node itself
function findLastChildNode(node: Element): Element {
  if (hasChildren(node)) {
    const childrenNode: Element = node.children[2]
    return findLastChildNode(childrenNode.children[childrenNode.children.length - 1])
  } else {
    return node
  }
}

export function findNextNameNode(node: Element): Element {
  // TODO make this more clever, see workflowy, in this case we just need to add the search for OPEN nodes
  const parentElement: Element = node.parentElement
  if (hasChildren(parentElement)) {
    // parentElement = div.node, parentElement.children[2] = div.children, and then the first child's name node
    return parentElement.children[2].children[0].children[1]
  } else if (parentElement.nextElementSibling) {
    return parentElement.nextElementSibling.children[1]
  } else {
    const firstAncestorNextSibling = findFirstAncestorNextSibling(parentElement)
    if (firstAncestorNextSibling) {
      return firstAncestorNextSibling.children[1]
    } else {
      return null
    }
  }
}

// Assuming we get passed a div.node this function will find the first
// next-sibling of an ancestor node and return it (div.node) or null if
// none could be found
function findFirstAncestorNextSibling(node: Element): Element {
  if (node.parentElement && node.parentElement.classList.contains('children')) {
    const parentElement: Element = node.parentElement.parentElement
    if (isRootNode(parentElement)) {
      return null
    } else {
      if (parentElement.nextElementSibling) {
        return parentElement.nextElementSibling
      } else {
        return findFirstAncestorNextSibling(parentElement)
      }
    }
  } else {
    return null
  }
}

export function getNodeId(node: Element): string {
  return node.getAttribute('id')
}

export function getNodeName(node: Element): string {
  return node.children[1].textContent || ''
}
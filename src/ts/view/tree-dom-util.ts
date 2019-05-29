// DOM Utilities for working with Node Elements and its structure
import { el } from 'redom'
import * as sanitize from '../lib/sanitize'

// Checks whether the current node has a parent
export function hasParentNode(node: Element): boolean {
  return node.parentElement &&
         node.parentElement.classList.contains('children') &&
         isNode(getParentNode(node))
}

function isRootNode(node: Element): boolean {
  return getNodeId(node) === 'ROOT'
}

export function isNode(element: Element): boolean {
  return element.classList.contains('node')
}

export function isNameNode(element: Element): boolean {
  return element.classList.contains('name')
}

export function isInNameNode(element: Element): boolean {
  return !! element.closest('.name')
}

export function isToggleElement(element: Element): boolean {
  return element.classList.contains('toggle')
}

export function isMenuTriggerElement(element: Element): boolean {
  return element.classList.contains('menuTrigger')
}

export function isEmbeddedLink(element: Element): boolean {
  return element.classList.contains('embeddedLink')
}

export function isFilterTag(element: Element): boolean {
  return element.classList.contains('filterTag')
}

export function extractFilterText(element: Element): string {
  return element.textContent
}

export function isInMenuElement(element: Element): boolean {
  return !!element.closest('.menu')
}

export function isCloseButton(element: Element): boolean {
  return element.classList.contains('closeButton')
}

export function isNoteElement(element: Element): boolean {
  return element.classList.contains('note')
}

export function isNodeClosed(element: Element): boolean {
  return element.classList.contains('closed')
}

export function isNodeCompleted(element: Element): boolean {
  return element.classList.contains('completed')
}

export function getNameElement(node: Element): Element {
  return node.children[0].children[1]
}

export function getChildrenElement(node: Element): Element {
  return node.children[1]
}

export function getChildrenElementOrCreate(node: Element): Element {
  if (node.children.length <= 1) {
    const newChildrenEl = el('div.children')
    node.appendChild(newChildrenEl)
    return newChildrenEl
  } else {
    return getChildrenElement(node)
  }
}

export function getNoteElement(node: Element): Element {
  return node.children[0].children[3]
}

export function getClosestNodeElement(nodeChildElement: Element): Element {
  return nodeChildElement.closest('.node')
}

// TODO should we fail fast here by throwing exception after checking hasParentNode?
export function getParentNode(node: Element): Element {
  // first parentElement is div.children, its parent is the real parent node
  return node.parentElement.parentElement
}

export function hasChildren(node: Element): boolean {
  return (
    node.children.length > 1 &&
    node.children[1].classList.contains('children') &&
    node.children[1].children.length > 0
  )
}

export function getNodeId(node: Element): string {
  return node.getAttribute('id')
}

export function getNodeName(node: Element): string {
  return getNameElement(node).textContent || ''
}

export function hideToggle(node: Element): void {
  const toggleElement = getToggleElement(node)
  toggleElement.classList.add('hidden')
}

export function unhideToggle(node: Element): void {
  const toggleElement = getToggleElement(node)
  toggleElement.classList.remove('hidden')
}

function getToggleElement(node: Element): Element {
  return node.querySelector('.toggle')
}

export function getNodeNote(node: Element): string {
  // sanitizeContent returns a documentFragment, apparently we can not get innerHTML on this
  // therefore we create an artificial element, append the fragment and get its innerHTML
  const noteEl = getNoteElement(node) as HTMLElement
  const newEl = document.createElement('div') as HTMLElement
  newEl.appendChild(sanitizeContent(noteEl))
  return newEl.innerHTML
}

export function isInNoteElement(element: Element): boolean {
  return isNoteElement(element) || (element.parentElement && isInNoteElement(element.parentElement))
}

export function findNoteElementAncestor(element: Element): Element {
  return isNoteElement(element)
    ? element
    : (element.parentElement ? findNoteElementAncestor(element.parentElement) : null)
}

// TODO add search for OPEN nodes, not just any node
export function findPreviousNode(node: Element): Element {
  if (node.previousSibling) {
    return findLastChildNode(node.previousElementSibling)
  } else if (hasParentNode(node)) {
    return getParentNode(node)
  } else {
    return null
  }
}

// Given a div.node it finds the LAST and deepest child (depth first) of that node, or the node itself
// It will not recurse into child nodes when the node itself is closed
export function findLastChildNode(node: Element): Element {
  if (hasChildren(node) && !isNodeClosed(node)) {
    const childrenNode: Element = getChildrenElement(node)
    return findLastChildNode(childrenNode.children[childrenNode.children.length - 1])
  } else {
    return node
  }
}

export function findNextNode(node: Element): Element {
  // TODO: make this more clever, see workflowy, in this case we just need to add the search for OPEN nodes
  if (hasChildren(node) && !isNodeClosed(node)) {
    return getChildrenElement(node).children[0]
  } else if (node.nextElementSibling) {
    return node.nextElementSibling
  } else {
    const firstAncestorNextSibling = findFirstAncestorNextSibling(node)
    if (firstAncestorNextSibling) {
      return firstAncestorNextSibling
    } else {
      return null
    }
  }
}

// Assuming we get passed a div.node this function will find the first
// next-sibling of an ancestor node and return it (div.node) or null if
// none could be found
function findFirstAncestorNextSibling(node: Element): Element {
  if (hasParentNode(node)) {
    const parentNode: Element = getParentNode(node)
    if (isRootNode(parentNode)) {
      return null
    } else {
      if (parentNode.nextElementSibling) {
        return parentNode.nextElementSibling
      } else {
        return findFirstAncestorNextSibling(parentNode)
      }
    }
  } else {
    return null
  }
}

const sanitizer = new sanitize.Sanitize({
  elements: ['a', 'b', 'br', 'em', 'i', 'u', 'div'], // div and br are because of contenteditable linebreaks
  attributes: {
    'a': ['href'],
  },
  add_attributes: {
    'a': {'rel': 'noreferrer'},
  },
  protocols: {
    'a': {'href': ['ftp', 'http', 'https', 'mailto']},
  },
})

function sanitizeContent(element: HTMLElement): HTMLElement {
  return sanitizer.clean_node(element)
}

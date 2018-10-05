import { Filter, FilteredFragment, ResolvedRepositoryNode, FilteredRepositoryNode } from './domain'

// element is of type any because I could not find a good way to abstract all
// the interfaces and mixins
// Assumes that query is lowercase
function filterElement(element: any, query: string): boolean {
  let hitFound = false
  if (element.nodeType === Node.TEXT_NODE) {
    let searchEl = element
    let pos = -1
    while (searchEl && (pos = searchEl.nodeValue.toLowerCase().indexOf(query)) > -1) {
      const newEl = searchEl.splitText(pos)
      searchEl = newEl.splitText(query.length)
      const markEl = document.createElement('mark')
      element.parentNode.replaceChild(markEl, newEl)
      markEl.appendChild(newEl)
      hitFound = true
    }
  } else if (element.childNodes) {
    for (const child of element.childNodes) {
      hitFound = hitFound || filterElement(child, query)
    }
  }
  return hitFound
}

function filterHtml(rawHtml: string, filter?: Filter): FilteredFragment {
  const fragment = document.createRange().createContextualFragment(rawHtml)
  let containsFilterHit = false
  if (filter) {
    // recursively go through all text nodes and find and annotate hits with a mark tag
    containsFilterHit = filterElement(fragment, filter.query.toLowerCase())
  }
  return {
    fragment,
    containsFilterHit,
  }
}

export function filterNode(node: ResolvedRepositoryNode, filter?: Filter): FilteredRepositoryNode {
  return new FilteredRepositoryNode(
    node.node,
    node.children.map(c => filterNode(c, filter)),
    !!filter,
    node.node.name ? filterHtml(node.node.name, filter) : null,
    node.node.content ? filterHtml(node.node.content, filter) : null)
}

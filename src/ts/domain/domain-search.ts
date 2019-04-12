import { Filter, FilteredFragment, ResolvedRepositoryNode, FilteredRepositoryNode, DeferredRepositoryNode } from './domain'

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

const linkRegexp = new RegExp('[^\\s]+://[^\\s]+')
function createLink(s: string): Element {
  const el = document.createElement('a')
  el.setAttribute('href', s)
  el.setAttribute('class', 'embeddedLink')
  el.innerHTML = s
  return el
}

function createFilterMarker(s: string): Element {
  const el = document.createElement('mark')
  el.innerHTML = s
  return el
}

function findAndMarkText(element: any, regex: RegExp, marker: (s) => Element): boolean {
  let hitFound = false
  if (element.nodeType === Node.TEXT_NODE) {
    let searchEl = element
    let reMatch = null
    while (searchEl && (reMatch = searchEl.nodeValue.match(regex))) {
      const newEl = searchEl.splitText(reMatch.index)
      searchEl = newEl.splitText(reMatch[0].length)
      const markEl = marker(reMatch[0])
      element.parentNode.replaceChild(markEl, newEl)
      hitFound = true
    }
  } else if (element.childNodes) {
    for (const child of element.childNodes) {
      hitFound = hitFound || findAndMarkText(child, regex, marker)
    }
  }
  return hitFound
}

function filterHtml(rawHtml: string, filter?: Filter): FilteredFragment {
  const fragment = document.createRange().createContextualFragment(rawHtml)
  // identify links, hashtags and @mentions to autolink
  findAndMarkText(fragment, linkRegexp, createLink)
  let containsFilterHit = false
  if (filter) {
    // recursively go through all text nodes and find and annotate hits with a mark tag
    // TODO: inline regex in filter
    containsFilterHit = findAndMarkText(fragment, new RegExp(filter.query, 'i'), createFilterMarker)
  }
  return {
    fragment,
    containsFilterHit,
  }
}

export async function filterNode(node: DeferredRepositoryNode, filter?: Filter): Promise<FilteredRepositoryNode> {
  return node.children
    .then(children => children.map(c => filterNode(c, filter)))
    .then(filteredChildren => new FilteredRepositoryNode(
      node.node,
      Promise.all(filteredChildren),
      !!filter,
      node.node.name ? filterHtml(node.node.name, filter) : null,
      node.node.content ? filterHtml(node.node.content, filter) : null))
}

export function filterNodeSynchronous(node: ResolvedRepositoryNode, filter?: Filter): FilteredRepositoryNode {
  return new FilteredRepositoryNode(
      node.node,
      Promise.resolve(node.children.map(c => filterNodeSynchronous(c, filter))),
      !!filter,
      node.node.name ? filterHtml(node.node.name, filter) : null,
      node.node.content ? filterHtml(node.node.content, filter) : null)
}

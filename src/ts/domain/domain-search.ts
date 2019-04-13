import { Filter, FilteredFragment, ResolvedRepositoryNode, FilteredRepositoryNode, DeferredRepositoryNode, markupHtml } from './domain'
import { findAndMarkText } from '../util'

function createFilterMarker(s: string): Element {
  const el = document.createElement('mark')
  el.innerHTML = s
  return el
}

function filterHtml(rawHtml: string, filter?: Filter): FilteredFragment {
  const fragment = markupHtml(rawHtml)
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

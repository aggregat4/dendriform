import { Filter, FilteredFragment, ResolvedRepositoryNode, FilteredRepositoryNode, DeferredRepositoryNode, markupHtml, QueryComponent } from './domain'
import { findAndMarkText } from '../util'

const splitRegexp = new RegExp('[,\\.;\\s]+')

export function parseQuery(query: string): QueryComponent[] {
  return query.split(splitRegexp).map(comp => new QueryComponent(comp))
}

function createFilterMarker(s: string): Element {
  const el = document.createElement('mark')
  el.innerHTML = s
  return el
}

function filterHtml(rawHtml: string, filter?: Filter): FilteredFragment {
  let fragment = markupHtml(rawHtml)
  let filterMatches = false
  if (filter) {
    // we AND search for all query components
    let hitCount = 0
    for (const queryComponent of filter.queryComponents) {
      if (findAndMarkText(fragment, new RegExp(queryComponent.value, 'i'), createFilterMarker)) {
        hitCount++
      } else {
        break
      }
    }
    filterMatches = hitCount === filter.queryComponents.length
    // if we did not find a hit we need to reset the the marked up fragment, we need to optimize this
    // so we don't constantly remarkup every node
    // if there was only one querycomponent to match, and we did not find a hit then we can just
    // use the original fragment, otherwise we need new markup
    if (!filterMatches && hitCount >= 1) {
      fragment = markupHtml(rawHtml)
    }
  }
  return {
    fragment,
    filterMatches,
  }
}

export function filterNode(node: ResolvedRepositoryNode, filter?: Filter): FilteredRepositoryNode {
  return new FilteredRepositoryNode(
    node.node,
    node.children ? node.children.map(c => filterNode(c, filter)) : null,
    !!filter,
    node.node.name ? filterHtml(node.node.name, filter) : null,
    node.node.note ? filterHtml(node.node.note, filter) : null)
}

export function filterNodeSynchronous(node: ResolvedRepositoryNode, filter?: Filter): FilteredRepositoryNode {
  return new FilteredRepositoryNode(
      node.node,
      node.children ? node.children.map(c => filterNodeSynchronous(c, filter)) : null,
      !!filter,
      node.node.name ? filterHtml(node.node.name, filter) : null,
      node.node.note ? filterHtml(node.node.note, filter) : null)
}

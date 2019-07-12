import { Filter, FilteredFragment, ResolvedRepositoryNode, FilteredRepositoryNode, QueryComponent } from './domain'
import { containsMarkup, toHtml, markupHtml, markupHtmlWithFilterHits } from '../utils/markup'

const splitRegexp = new RegExp('[,\\.;\\s]+')

export function parseQuery(query: string): QueryComponent[] {
  return query.split(splitRegexp).map(comp => new QueryComponent(comp))
}

function filterHtml(rawHtml: string, filter?: Filter): FilteredFragment {
  if (filter) {
    let filterMatches = false
    // we AND search for all query components
    let hitCount = 0
    const lowerCaseContent = rawHtml.toLowerCase()
    for (const queryComponent of filter.queryComponents) {
      if (lowerCaseContent.indexOf(queryComponent.value) !== -1) {
        hitCount++
      } else {
        break
      }
    }
    filterMatches = hitCount === filter.queryComponents.length
    if (!filterMatches) {
      return {
        fragment: containsMarkup(rawHtml) ? toHtml(markupHtml(rawHtml)) : rawHtml,
        filterMatches: false,
      }
    } else {
      return {
        fragment: toHtml(markupHtmlWithFilterHits(rawHtml, filter.queryComponents.map(qc => qc.value))),
        filterMatches: true,
      }
    }
  } else {
    return {
      fragment: containsMarkup(rawHtml) ? toHtml(markupHtml(rawHtml)) : rawHtml,
      filterMatches: false,
    }
  }
}

export function filterNode(node: ResolvedRepositoryNode, filter?: Filter): FilteredRepositoryNode {
  return new FilteredRepositoryNode(
    node.node,
    { loaded: node.children.loaded, elements: node.children.elements.map(c => filterNode(c, filter)) },
    !!filter,
    node.node.name ? filterHtml(node.node.name, filter) : null,
    node.node.note ? filterHtml(node.node.note, filter) : null)
}

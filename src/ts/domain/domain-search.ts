import { Filter, FilteredFragment, ResolvedRepositoryNode, FilteredRepositoryNode, QueryComponent } from './domain'
import { findAndMarkText, markupHtml, containsMarkup, toHtml, markupHtmlMNode, markupHtmlMNodeWithFilterHits } from '../utils/markup'

const splitRegexp = new RegExp('[,\\.;\\s]+')

export function parseQuery(query: string): QueryComponent[] {
  return query.split(splitRegexp).map(comp => new QueryComponent(comp))
}

function filterHtml(rawHtml: string, filter?: Filter): FilteredFragment {
  if (filter) {
    //let fragment = markupHtml(rawHtml)
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
      // if (findAndMarkText(fragment, new RegExp(queryComponent.value, 'i'), createFilterMarker)) {
      //   hitCount++
      // } else {
      //   break
      // }
    }
    filterMatches = hitCount === filter.queryComponents.length
    // if we did not find a hit we need to reset the the marked up fragment, we need to optimize this
    // so we don't constantly remarkup every node
    // if there was only one querycomponent to match, and we did not find a hit then we can just
    // use the original fragment, otherwise we need new markup
    if (!filterMatches) {
      return {
        fragment: containsMarkup(rawHtml) ? toHtml(markupHtmlMNode(rawHtml)) : rawHtml,
        filterMatches: false,
      }
    } else {
      return {
        fragment: toHtml(markupHtmlMNodeWithFilterHits(rawHtml, filter.queryComponents.map(qc => qc.value))),
        filterMatches: true,
      }
    }
  } else {
    return {
      fragment: containsMarkup(rawHtml) ? toHtml(markupHtmlMNode(rawHtml)) : rawHtml,
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

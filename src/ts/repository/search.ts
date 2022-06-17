import { containsMarkup, markupHtml, markupHtmlWithFilterHits, toHtml } from '../utils/markup'
import { findFirst, isEmpty } from '../utils/util'
import { DeferredArray, RepositoryNode, ResolvedRepositoryNode } from './repository'

const splitRegexp = new RegExp('[,\\.;\\s]+')

export class QueryComponent {
  constructor(readonly value: string) {}
}

/**
 * Splits the query into its consituents, removing whitespace and lowercasing all strings.
 */
export function parseQuery(query: string): QueryComponent[] {
  return query
    .split(splitRegexp)
    .filter((s) => !isEmpty(s))
    .map((comp) => new QueryComponent(comp.toLowerCase()))
}

export class Filter {
  constructor(readonly queryComponents: QueryComponent[]) {}
}

interface FilteredFragment {
  fragment: string
  filterMatches: boolean
}

/**
 * Assumes that filter query components are all lowercase.
 */
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
        fragment: toHtml(
          markupHtmlWithFilterHits(
            rawHtml,
            filter.queryComponents.map((qc) => qc.value)
          )
        ),
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
    {
      loaded: node.children.loaded,
      elements: node.children.elements.map((c) => filterNode(c, filter)),
    },
    !!filter,
    node.node.name ? filterHtml(node.node.name, filter) : null,
    node.node.note ? filterHtml(node.node.note, filter) : null
  )
}

export class FilteredRepositoryNode {
  private areAnyChildrenIncluded: boolean = undefined

  constructor(
    readonly node: RepositoryNode,
    readonly children: DeferredArray<FilteredRepositoryNode>,
    readonly filterApplied: boolean,
    readonly filteredName: FilteredFragment,
    readonly filteredNote: FilteredFragment
  ) {}

  isIncluded(): boolean {
    if (this.areAnyChildrenIncluded === undefined) {
      // We don't really care about the deferred loading here, if it is not loaded then we don't have to check any children
      this.areAnyChildrenIncluded = !!findFirst(
        this.children.elements,
        (c: FilteredRepositoryNode) => c.isIncluded()
      )
    }
    return (
      !this.filterApplied ||
      (this.filteredName && this.filteredName.filterMatches) ||
      (this.filteredNote && this.filteredNote.filterMatches) ||
      this.areAnyChildrenIncluded
    )
  }
}

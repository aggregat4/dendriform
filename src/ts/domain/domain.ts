export interface RepositoryNode {
  _id: string,
  _rev?: string,
  name: string,
  content: string,
  childrefs: string[],
  parentref: string,
  deleted?: boolean,
  collapsed?: boolean,
}

export function createNewRepositoryNode(id: string, name: string, parentref?: string): RepositoryNode {
  return {
    _id: id,
    name,
    content: null,
    childrefs: [],
    parentref,
  }
}

export function createNewResolvedRepositoryNode(id: string, name: string, parentref?: string): ResolvedRepositoryNode {
  return {
    node: createNewRepositoryNode(id, name, parentref),
    children: [],
  }
}

// TODO: consider refactoring this to just extend the RepositoryNode interface
export interface ResolvedRepositoryNode {
  node: RepositoryNode,
  children: ResolvedRepositoryNode[],
}

export interface Filter {
  query: string
}

export interface Highlight {
  pos: number,
  length: number
}

function findFirst(array: any[], predicate: (any) => boolean): any {
  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i])) {
      return array[i]
    }
  }
  return null
}

export class FilteredRepositoryNode {
  private areAnyChildrenIncluded: boolean = undefined

  constructor(
    readonly node: RepositoryNode,
    readonly children: FilteredRepositoryNode[],
    readonly filterApplied: boolean,
    readonly hasNameHit: boolean,
    readonly nameFragment: DocumentFragment,
    readonly hasNoteHit: boolean,
    readonly noteFragment: DocumentFragment) {}

  isIncluded(): boolean {
    if (this.areAnyChildrenIncluded === undefined) {
      this.areAnyChildrenIncluded = !!findFirst(this.children, (c) => c.isIncluded())
    }
    return !this.filterApplied
      || this.hasNameHit
      || this.hasNoteHit
      || this.areAnyChildrenIncluded
  }
}

function findHits(corpus: string, filter: Filter): Highlight[] {
  const highlights = []
  let pos = 0 - filter.query.length
  const lowerCaseCorpus = corpus.toLowerCase()
  while ((pos = lowerCaseCorpus.indexOf(filter.query, pos + filter.query.length)) > -1) {
    highlights.push({pos, length: filter.query.length})
  }
  return highlights
}

interface FilteredFragment {
  fragment: DocumentFragment,
  containsFilterHit: boolean
}

function filterElement(element: Element, filter: Filter): boolean {
  const hitFound = false
  if (element.nodeType === Node.TEXT_NODE) {
    let searchEl = element
    let pos = -1
    while (searchEl && (pos = searchEl.nodeValue.indexOf(filter.query)) > -1) {
      const newEl = searchEl.splitText(pos)
      // TODO: Continue
      searchEl = newEl.splitText(filter.query.length)
    }
  } else if (element.children) {
    for (const child of element.children) {
      filterElement(child, filter)
    }
  }
  return hitFound
}

function filterHtml(rawHtml: string, filter: Filter): FilteredFragment {
  // const fragment = document.createDocumentFragment()
  const fragment = document.createRange().createContextualFragment(rawHtml)
  // recursively go through all text nodes and find and annotate hits with a mark tag
  filterElement(fragment, filter)
}

export function filterNode(node: ResolvedRepositoryNode, filter?: Filter): FilteredRepositoryNode {
  return new FilteredRepositoryNode(
    node.node,
    node.children.map(c => filterNode(c, filter)),
    !!filter,
    filter && node.node.name ? findHits(node.node.name, filter) : [],
    filter && node.node.content ? findHits(node.node.content, filter) : [])
}

export enum State {
  LOADING,
  LOADED,
  ERROR,
  NOT_FOUND,
}

export interface Status {
  state: State
  msg?: string
}

export interface LoadedTree {
  status: Status
  tree?: ResolvedRepositoryNode
  parents?: RepositoryNode[]
}

export enum RelativeLinearPosition {
  BEFORE,
  AFTER,
  BEGINNING,
  END,
}

export interface RelativeNodePosition {
  nodeId: string,
  beforeOrAfter: RelativeLinearPosition
}

export enum MergeNameOrder {
  SOURCE_TARGET,
  TARGET_SOURCE,
}

import {findFirst} from '../util'

export const BEGINNING_NODELIST_MARKER = '|-'
export const END_NODELIST_MARKER = '-|'

export interface RepositoryNode {
  _id: string,
  name: string,
  content: string,
  deleted?: boolean,
  collapsed?: boolean,
}

export function nodeIsDeleted(node: RepositoryNode): boolean { return node.deleted && node.deleted === true }

export function nodeIsNotDeleted(node: RepositoryNode): boolean { return !node.deleted || node.deleted !== true }

export function createNewRepositoryNode(id: string, name: string, parentref?: string): RepositoryNode {
  return {
    _id: id,
    name,
    content: null,
  }
}

export function createNewResolvedRepositoryNode(id: string, name: string, parentref?: string): ResolvedRepositoryNode {
  return {
    node: createNewRepositoryNode(id, name, parentref),
    children: [],
  }
}

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

export interface FilteredFragment {
  fragment: DocumentFragment,
  containsFilterHit: boolean
}

export class FilteredRepositoryNode {
  private areAnyChildrenIncluded: boolean = undefined

  constructor(
    readonly node: RepositoryNode,
    readonly children: FilteredRepositoryNode[],
    readonly filterApplied: boolean,
    readonly filteredName: FilteredFragment,
    readonly filteredNote: FilteredFragment) {}

  isIncluded(): boolean {
    if (this.areAnyChildrenIncluded === undefined) {
      this.areAnyChildrenIncluded = !!findFirst(this.children, (c) => c.isIncluded())
    }
    return !this.filterApplied
      || (this.filteredName && this.filteredName.containsFilterHit)
      || (this.filteredNote && this.filteredNote.containsFilterHit)
      || this.areAnyChildrenIncluded
  }
}

// element is of type any because I could not find a good way to abstract all
// the interfaces and mixins
// Assuming that query is lowercase
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
  ancestors?: RepositoryNode[]
}

export enum RelativeLinearPosition {
  BEFORE,
  AFTER,
  BEGINNING,
  END,
}

export interface RelativeNodePosition {
  nodeId?: string,
  beforeOrAfter: RelativeLinearPosition
}

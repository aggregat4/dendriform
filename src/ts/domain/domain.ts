import { getCursorPosAcrossMarkup, setCursorPosAcrossMarkup, Predicate, createCompositeAndPredicate, findFirst } from '../util'
import { toHtml, containsMarkup, markupHtmlMNode} from '../utils/markup'
import { DateTime } from 'luxon'

export const BEGINNING_NODELIST_MARKER = '|-'
export const END_NODELIST_MARKER = '-|'

export interface RepositoryNode {
  _id: string,
  name: string,
  note: string,
  deleted: boolean,
  collapsed: boolean,
  completed: boolean,
  created: string, // ISO 8601 timestamp with timezone information, e.g. "2007-04-05T14:30Z"
  updated: string, // ISO 8601 timestamp with timezone information, e.g. "2007-04-05T14:30Z"
}

// const NODE_IS_DELETED: Predicate<RepositoryNode> = (node: RepositoryNode) => !!node.deleted
export const NODE_IS_NOT_DELETED: Predicate<RepositoryNode> = (node: RepositoryNode) => !node.deleted

export const NODE_IS_COMPLETED: Predicate<RepositoryNode> = (node: RepositoryNode) => !!node.completed
export const NODE_IS_NOT_COMPLETED: Predicate<RepositoryNode> = (node: RepositoryNode) => !node.completed

export const NODE_NOT_DELETED_AND_NOT_COMPLETED = createCompositeAndPredicate([NODE_IS_NOT_DELETED, NODE_IS_NOT_COMPLETED])

export const NODE_IS_COLLAPSED: Predicate<RepositoryNode> = (node: RepositoryNode) => !!node.collapsed
export const NODE_IS_NOT_COLLAPSED: Predicate<RepositoryNode> = (node: RepositoryNode) => !node.collapsed

export function createNewRepositoryNodeWithContent(id: string, name: string, content: string): RepositoryNode {
  return {
    _id: id,
    name,
    note: content,
    deleted: false,
    collapsed: false,
    completed: false,
    // as opposed to 'toISOString', the 'format' function renders in the local timezone, which is what we want
    created: DateTime.local().toISO(),
    updated: DateTime.local().toISO(),
  }
}

export function createNewRepositoryNode(id: string, name: string): RepositoryNode {
  return createNewRepositoryNodeWithContent(id, name, null)
}

export interface DeferredArray<T> {
  loaded: boolean,
  elements: T[],
}

export interface ResolvedRepositoryNode {
  node: RepositoryNode,
  children: DeferredArray<ResolvedRepositoryNode>,
}

export function createNewResolvedRepositoryNodeWithContent(id: string, name: string, content: string): ResolvedRepositoryNode {
  return {
    node: createNewRepositoryNodeWithContent(id, name, content),
    children: { loaded: true, elements: [] },
  }
}

export function createNewResolvedRepositoryNode(id: string, name: string): ResolvedRepositoryNode {
  return createNewResolvedRepositoryNodeWithContent(id, name, null)
}

export class QueryComponent {
  constructor(readonly value: string) {}
}

export class Filter {
  constructor(readonly queryComponents: QueryComponent[]) {}
}

export interface Highlight {
  pos: number,
  length: number
}

export interface FilteredFragment {
  fragment: string,
  filterMatches: boolean
}

export class FilteredRepositoryNode {
  private areAnyChildrenIncluded: boolean = undefined

  constructor(
    readonly node: RepositoryNode,
    readonly children: DeferredArray<FilteredRepositoryNode>,
    readonly filterApplied: boolean,
    readonly filteredName: FilteredFragment,
    readonly filteredNote: FilteredFragment) {}

  isIncluded(): boolean {
    if (this.areAnyChildrenIncluded === undefined) {
      // We don't really care about the deferred loading here, if it is not loaded then we don't have to check any children
      this.areAnyChildrenIncluded = !! findFirst(this.children.elements, (c) => c.isIncluded())
    }
    return !this.filterApplied
      || (this.filteredName && this.filteredName.filterMatches)
      || (this.filteredNote && this.filteredNote.filterMatches)
      || this.areAnyChildrenIncluded
  }
}

export const enum State {
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

export const enum RelativeLinearPosition {
  BEFORE,
  AFTER,
  BEGINNING,
  END,
}

export interface RelativeNodePosition {
  nodeId?: string,
  beforeOrAfter: RelativeLinearPosition
}

export interface Subscription {
  cancel(): void
}

// TODO: this is not really strictly domain, it is more of a utility generic domain, where to put it?
export interface ActivityIndicating {
  isActive(): boolean
  getActivityTitle(): string
}

function updateAllEmbeddedLinks(node: Element): void {
  for (const anchor of node.querySelectorAll('a.embeddedLink')) {
    const anchorText = anchor.textContent
    if (anchor.getAttribute('href') !== anchorText) {
      anchor.setAttribute('href', anchorText)
    }
  }
}

/**
 * Will figure out whether the provided element's contents require something to be
 * marked up (or have markup removed). If it does it will replace the contents of the
 * node and preserve the cursor position in the process.
 *
 * It will also make sure all the embeddedLink elements have the correct href value.
 */
export function verifyAndRepairMarkup(el: Element, newText: string): void {
  if (containsMarkup(newText)) {
    const newMarkup = markupHtmlMNode(newText)
    const cursorPos = getCursorPosAcrossMarkup(el)
    el.innerHTML = toHtml(newMarkup)
    updateAllEmbeddedLinks(el)
    setCursorPosAcrossMarkup(el, cursorPos)
    // const newMarkup = markupHtml(newText)
    // updateAllEmbeddedLinks(el)
    // const cursorPos = getCursorPosAcrossMarkup(el)
    // el.innerHTML = ''
    // el.appendChild(newMarkup)
    // setCursorPosAcrossMarkup(el, cursorPos)
  }
}

import {findAndMarkText, countNonTextNodes, getCursorPosAcrossMarkup, setCursorPosAcrossMarkup, Predicate, createCompositeAndPredicate, findFirst} from '../util'
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

export function createNewRepositoryNodeWithContent(id: string, name: string, content: string): RepositoryNode {
  return {
    _id: id,
    name,
    note: content,
    deleted: false,
    collapsed: false,
    // as opposed to 'toISOString', the 'format' function renders in the local timezone, which is what we want
    created: DateTime.local().toISO(),
    updated: DateTime.local().toISO(),
    completed: false,
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
  fragment: DocumentFragment,
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

// TODO: does this belong here?
const linkRegexp = new RegExp('[^\\s]+://[^\\s]+')
function createLink(s: string): Element {
  const el = document.createElement('a')
  el.setAttribute('href', s)
  el.setAttribute('class', 'embeddedLink')
  el.setAttribute('rel', 'noreferrer')
  el.innerHTML = s
  return el
}

const filterRegexp = new RegExp('\\s([@#][\\w-]+)')
function createFilterLink(s: string): Element {
  const el = document.createElement('span')
  el.setAttribute('class', 'filterTag')
  el.innerHTML = s
  return el
}

const boldRegexp = new RegExp('\\*\\*[^\\*]+\\*\\*')
function createBoldTag(s: string): Element {
  const el = document.createElement('b')
  el.innerHTML = s
  return el
}

const italicRegexp = new RegExp('_[^_]+_')
function createItalicTag(s: string): Element {
  const el = document.createElement('i')
  el.innerHTML = s
  return el
}

// TODO: if we are really going to use this for formatting styles then we need something better than this
// poor man's markup engine. This makes many passes and nested markup is not possible.
export function markupHtml(rawHtml: string): DocumentFragment {
  const fragment = document.createRange().createContextualFragment(rawHtml)
  // identify links, hashtags and @mentions to autolink
  findAndMarkText(fragment, linkRegexp, createLink)
  findAndMarkText(fragment, filterRegexp, createFilterLink)
  findAndMarkText(fragment, boldRegexp, createBoldTag)
  findAndMarkText(fragment, italicRegexp, createItalicTag)
  return fragment
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
  const newMarkup = markupHtml(newText)
  const newTagCount = countNonTextNodes(newMarkup)
  if (el.textContent === newText && newTagCount === 0) {
    return
  }
  updateAllEmbeddedLinks(el)
  const cursorPos = getCursorPosAcrossMarkup(el)
  el.innerHTML = ''
  el.appendChild(newMarkup)
  setCursorPosAcrossMarkup(el, cursorPos)
}

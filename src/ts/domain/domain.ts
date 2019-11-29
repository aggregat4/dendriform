import { getCursorPosAcrossMarkup, setCursorPosAcrossMarkup, Predicate, createCompositeAndPredicate, findFirst } from '../utils/util'
import { toHtml, containsMarkup, markupHtml} from '../utils/markup'
import { secondsSinceEpoch } from '../utils/dateandtime'

export interface Initializeable {
  init(): Promise<void>
  deinit(): Promise<void>
}

export interface RepositoryNode {
  _id: string,
  name: string,
  note: string,
  deleted: boolean,
  collapsed: boolean,
  completed: boolean,
  created: number, // seconds since the epoch
  updated: number, // seconds since the epoch
}

// const NODE_IS_DELETED: Predicate<RepositoryNode> = (node: RepositoryNode) => !!node.deleted
export const NODE_IS_NOT_DELETED: Predicate<RepositoryNode> = (node: RepositoryNode) => !node.deleted
export const NODE_IS_NOT_COMPLETED: Predicate<RepositoryNode> = (node: RepositoryNode) => !node.completed
export const NODE_NOT_DELETED_AND_NOT_COMPLETED = createCompositeAndPredicate([NODE_IS_NOT_DELETED, NODE_IS_NOT_COMPLETED])
export const NODE_IS_NOT_COLLAPSED: Predicate<RepositoryNode> = (node: RepositoryNode) => !node.collapsed

function createNewRepositoryNodeWithContent(id: string, name: string, content: string): RepositoryNode {
  return {
    _id: id,
    name,
    note: content,
    deleted: false,
    collapsed: false,
    completed: false,
    // as opposed to 'toISOString', the 'format' function renders in the local timezone, which is what we want
    created: secondsSinceEpoch(),
    updated: secondsSinceEpoch(),
  }
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

export class QueryComponent {
  constructor(readonly value: string) {}
}

export class Filter {
  constructor(readonly queryComponents: QueryComponent[]) {}
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
    const newMarkup = markupHtml(newText)
    const cursorPos = getCursorPosAcrossMarkup(el)
    el.innerHTML = toHtml(newMarkup)
    updateAllEmbeddedLinks(el)
    setCursorPosAcrossMarkup(el, cursorPos)
  }
}

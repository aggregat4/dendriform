import {findFirst, findFirstAsync} from '../util'

export const BEGINNING_NODELIST_MARKER = '|-'
export const END_NODELIST_MARKER = '-|'

export interface RepositoryNode {
  _id: string,
  name: string,
  content: string,
  deleted?: boolean,
  collapsed?: boolean,
}

function nodeIsDeleted(node: RepositoryNode): boolean { return node.deleted && node.deleted === true }

export function nodeIsNotDeleted(node: RepositoryNode): boolean { return !nodeIsDeleted(node) }

export function createNewRepositoryNodeWithContent(id: string, name: string, content: string): RepositoryNode {
  return {
    _id: id,
    name,
    content,
  }
}

export function createNewRepositoryNode(id: string, name: string): RepositoryNode {
  return createNewRepositoryNodeWithContent(id, name, null)
}

export interface ResolvedRepositoryNode {
  node: RepositoryNode,
  children: ResolvedRepositoryNode[],
}

export function createNewResolvedRepositoryNodeWithContent(id: string, name: string, content: string): ResolvedRepositoryNode {
  return {
    node: createNewRepositoryNodeWithContent(id, name, content),
    children: [],
  }
}

export function createNewDeferredRepositoryNodeWithContent(id: string, name: string, content: string): DeferredRepositoryNode {
  return {
    node: createNewRepositoryNodeWithContent(id, name, content),
    children: Promise.resolve([]),
  }
}

export function createNewResolvedRepositoryNode(id: string, name: string): ResolvedRepositoryNode {
  return createNewResolvedRepositoryNodeWithContent(id, name, null)
}

export interface DeferredRepositoryNode {
  node: RepositoryNode
  children: Promise<DeferredRepositoryNode[]>
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
    readonly children: Promise<FilteredRepositoryNode[]>,
    readonly filterApplied: boolean,
    readonly filteredName: FilteredFragment,
    readonly filteredNote: FilteredFragment) {}

  async isIncluded(): Promise<boolean> {
    if (this.areAnyChildrenIncluded === undefined) {
      const resolvedChildren = await this.children
      // implNote: it is important to !! the return value after awaiting, otherwise this is always true!
      // because you are getting a promise object, not the actual value
      this.areAnyChildrenIncluded = !! await findFirstAsync(resolvedChildren, async (c) => await c.isIncluded())
    }
    return !this.filterApplied
      || (this.filteredName && this.filteredName.containsFilterHit)
      || (this.filteredNote && this.filteredNote.containsFilterHit)
      || this.areAnyChildrenIncluded
  }
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
  tree?: DeferredRepositoryNode
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

export interface Subscription {
  cancel(): void
}

// TODO: this is not really strictly domain, it is more of a utility generic domain, where to put it?
export interface ActivityIndicating {
  isActive(): boolean
  getActivityTitle(): string
}

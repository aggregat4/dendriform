import { RelativeNodePosition } from '../domain/domain'
import { LifecycleAware, Subscription } from '../domain/lifecycle'
import { secondsSinceEpoch } from '../utils/dateandtime'
import { findFirst, Predicate } from '../utils/util'
import { FilteredFragment } from './domain-search'

export interface DeferredArray<T> {
  loaded: boolean
  elements: T[]
}

// const NODE_IS_DELETED: Predicate<RepositoryNode> = (node: RepositoryNode) => !!node.deleted
export const NODE_IS_NOT_DELETED: Predicate<RepositoryNode> = (node: RepositoryNode) =>
  !node.deleted
export const NODE_IS_NOT_COMPLETED: Predicate<RepositoryNode> = (node: RepositoryNode) =>
  !node.completed
// export const NODE_NOT_DELETED_AND_NOT_COMPLETED = createCompositeAndPredicate([
//   NODE_IS_NOT_DELETED,
//   NODE_IS_NOT_COMPLETED,
// ])
// export const NODE_IS_NOT_COLLAPSED: Predicate<RepositoryNode> = (node: RepositoryNode) =>
//   !node.collapsed

export interface LoadedTree {
  status: Status
  tree?: ResolvedRepositoryNode
  ancestors?: RepositoryNode[]
}

export interface RepositoryNode {
  _id: string
  name: string
  note: string
  deleted: boolean
  collapsed: boolean
  completed: boolean
  created: number // seconds since the epoch
  updated: number // seconds since the epoch
}

function createNewRepositoryNodeWithContent(
  id: string,
  name: string,
  content: string
): RepositoryNode {
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

export function createNewResolvedRepositoryNodeWithContent(
  id: string,
  name: string,
  content: string
): ResolvedRepositoryNode {
  return {
    node: createNewRepositoryNodeWithContent(id, name, content),
    children: { loaded: true, elements: [] },
  }
}

export interface ResolvedRepositoryNode {
  node: RepositoryNode
  children: DeferredArray<ResolvedRepositoryNode>
}

export interface Repository extends LifecycleAware {
  createNode(id: string, name: string, content: string, synchronous: boolean): Promise<void>
  updateNode(node: RepositoryNode, synchronous: boolean): Promise<void>
  reparentNode(
    childId: string,
    parentId: string,
    position: RelativeNodePosition,
    synchronous: boolean
  ): Promise<void>

  getChildIds(nodeId: string): Promise<string[]>
  getParentId(nodeId: string): Promise<string>
  loadNode(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<RepositoryNode>
  loadTree(
    nodeId: string,
    nodeFilter: Predicate<RepositoryNode>,
    loadCollapsedChildren: boolean
  ): Promise<LoadedTree>

  subscribeToChanges(
    parentNodeId: string,
    nodeChangeListener: (nodeId: string) => void
  ): Subscription
}

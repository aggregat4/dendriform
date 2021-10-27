import { RelativeNodePosition } from '../domain/domain'
import { LifecycleAware, Subscription } from '../domain/lifecycle'
import { secondsSinceEpoch } from '../utils/dateandtime'
import { Predicate } from '../utils/util'

export interface DeferredArray<T> {
  loaded: boolean
  elements: T[]
}

export const NODE_IS_NOT_DELETED: Predicate<RepositoryNode> = (node: RepositoryNode) =>
  !node.deleted
export const NODE_IS_NOT_COMPLETED: Predicate<RepositoryNode> = (node: RepositoryNode) =>
  !node.completed

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
  loadNode(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<RepositoryNode>

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

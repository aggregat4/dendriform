import { RelativeNodePosition, Subscription } from '../domain/domain'
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
  id: string
  name: string
  note: string
  deleted: boolean
  collapsed: boolean
  completed: boolean
  created: number // seconds since the epoch
  updated: number // seconds since the epoch
}

export const ROOT_NODE: RepositoryNode = {
  id: 'ROOT',
  name: 'ROOT',
  note: null,
  collapsed: false,
  deleted: false,
  completed: false,
  created: 0,
  updated: 0,
}

function createNewRepositoryNodeWithContent(
  id: string,
  name: string,
  content: string
): RepositoryNode {
  return {
    id: id,
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

export const STATUS_LOADED: Status = { state: State.LOADED }
export const STATUS_NOT_FOUND: Status = { state: State.NOT_FOUND }

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

export interface Repository {
  loadNode(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<RepositoryNode>

  createNode(
    id: string,
    parentId: string,
    name: string,
    content: string,
    synchronous: boolean,
    relativePosition: RelativeNodePosition
  ): Promise<void>

  updateNode(
    nodeId: string,
    parentId: string,
    synchronous: boolean,
    updateFun: (node: RepositoryNode) => boolean
  ): Promise<void>

  reparentNode(
    nodeId: string,
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

  subscribeToChanges(parentNodeId: string, nodeChangeListener: () => void): Subscription
}

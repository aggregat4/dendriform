export interface RepositoryNode {
  _id: string,
  _rev?: string,
  name: string,
  content: string,
  childrefs: string[],
  parentref: string,
  deleted?: boolean
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

export interface ResolvedRepositoryNode {
  node: RepositoryNode,
  children: ResolvedRepositoryNode[]
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

export interface Repository {
  cdbCreateNode(id: string, name: string, content: string): Promise<RepositoryNode>
  cdbPutNode(node: RepositoryNode, retryCount?: number): Promise<void>
  cdbSaveAll(nodes: RepositoryNode[]): Promise<void>
  cdbLoadNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode>
  cdbLoadChildren(node: RepositoryNode, includeDeleted: boolean): Promise<RepositoryNode[]>
  cdbLoadTree(node: RepositoryNode): Promise<LoadedTree>
}

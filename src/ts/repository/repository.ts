import {RepositoryNode, LoadedTree} from '../domain/domain'

export interface Repository {
  cdbCreateNode(id: string, name: string, content: string): Promise<RepositoryNode>
  cdbPutNode(node: RepositoryNode, retryCount?: number): Promise<void>
  cdbSaveAll(nodes: RepositoryNode[]): Promise<void>
  cdbLoadNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode>
  cdbLoadChildren(node: RepositoryNode, includeDeleted: boolean): Promise<RepositoryNode[]>
  cdbLoadTree(node: RepositoryNode): Promise<LoadedTree>
}

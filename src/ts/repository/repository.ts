import {RepositoryNode, LoadedTree, RelativeNodePosition} from '../domain/domain'

// TODO: rename everything to not have this cdb prefix
export interface Repository {
  cdbCreateNode(id: string, name: string, content: string): Promise<RepositoryNode>
  cdbPutNode(node: RepositoryNode): Promise<void>
  // TODO: remove this when we get rid of reparentNodes in treeservice?
  cdbSaveAll(nodes: RepositoryNode[]): Promise<void>
  cdbReparentNode(child: RepositoryNode, parentId: string, position: RelativeNodePosition): Promise<void>

  cdbLoadNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode>
  cdbLoadChildren(node: RepositoryNode, includeDeleted: boolean): Promise<RepositoryNode[]>
  cdbLoadTree(node: RepositoryNode): Promise<LoadedTree>
}

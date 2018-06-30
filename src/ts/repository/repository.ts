import {RepositoryNode, LoadedTree, RelativeNodePosition} from '../domain/domain'

export interface Repository {
  createNode(id: string, name: string, content: string): Promise<RepositoryNode>
  putNode(node: RepositoryNode): Promise<void>
  reparentNode(child: RepositoryNode, parentId: string, position: RelativeNodePosition): Promise<void>

  loadNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode>
  loadChildren(node: RepositoryNode, includeDeleted: boolean): Promise<RepositoryNode[]>
  loadTree(node: RepositoryNode): Promise<LoadedTree>
}

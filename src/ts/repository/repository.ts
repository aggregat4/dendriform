import {RepositoryNode, LoadedTree, RelativeNodePosition} from '../domain/domain'

export interface Repository {
  createNode(id: string, name: string, content: string): Promise<RepositoryNode>
  putNode(node: RepositoryNode): Promise<void>
  reparentNode(childId: string, parentId: string, position: RelativeNodePosition): Promise<void>

  getChildIds(nodeId: string): Promise<string[]>
  getParentId(nodeId: string): Promise<string>

  loadNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode>
  loadTree(nodeId: string): Promise<LoadedTree>
}

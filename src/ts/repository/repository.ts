import {RepositoryNode, LoadedTree, RelativeNodePosition} from '../domain/domain'
import { Predicate } from '../util'

export interface Repository {
  createNode(id: string, name: string, content: string): Promise<void>
  updateNode(node: RepositoryNode): Promise<void>
  reparentNode(childId: string, parentId: string, position: RelativeNodePosition): Promise<void>

  getChildIds(nodeId: string): Promise<string[]>
  getParentId(nodeId: string): Promise<string>
  loadNode(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<RepositoryNode>
  loadTree(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<LoadedTree>
}

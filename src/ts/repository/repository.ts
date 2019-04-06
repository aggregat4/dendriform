import {RepositoryNode, LoadedTree, RelativeNodePosition, Subscription} from '../domain/domain'
import { Predicate } from '../util'

export interface Repository {
  createNode(id: string, name: string, content: string, synchronous: boolean): Promise<void>
  updateNode(node: RepositoryNode, synchronous: boolean): Promise<void>
  reparentNode(childId: string, parentId: string, position: RelativeNodePosition, synchronous: boolean): Promise<void>

  getChildIds(nodeId: string): Promise<string[]>
  getParentId(nodeId: string): Promise<string>
  loadNode(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<RepositoryNode>
  loadTree(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<LoadedTree>

  subscribeToChanges(parentNodeId: string, nodeChangeListener: (nodeId: string) => void): Subscription
}

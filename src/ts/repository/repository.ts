import {RepositoryNode, LoadedTree, RelativeNodePosition, Subscription, Initializeable} from '../domain/domain'
import { Predicate } from '../utils/util'

export interface Repository extends Initializeable {
  createNode(id: string, name: string, content: string, synchronous: boolean): Promise<void>
  updateNode(node: RepositoryNode, synchronous: boolean): Promise<void>
  reparentNode(childId: string, parentId: string, position: RelativeNodePosition, synchronous: boolean): Promise<void>

  getChildIds(nodeId: string): Promise<string[]>
  getParentId(nodeId: string): Promise<string>
  loadNode(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<RepositoryNode>
  loadTree(nodeId: string, nodeFilter: Predicate<RepositoryNode>, loadCollapsedChildren: boolean): Promise<LoadedTree>

  subscribeToChanges(parentNodeId: string, nodeChangeListener: (nodeId: string) => void): Subscription
}

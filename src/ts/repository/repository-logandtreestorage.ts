import {
  RelativeNodePosition,
  RELATIVE_NODE_POSITION_END,
  RELATIVE_NODE_POSITION_UNCHANGED,
  Subscription,
} from '../domain/domain'
import { LifecycleAware } from '../domain/lifecycle'
import { DEventLog } from '../eventlog/eventlog-domain'
import { MoveOpTree } from '../moveoperation/moveoperation'
import { secondsSinceEpoch } from '../utils/dateandtime'
import { Predicate } from '../utils/util'
import { LoadedTree, Repository, RepositoryNode } from './repository'

// TODO: most of the real implementation (also subscribe to eventlog to update treeStorageStructure and notify subscribers)
export class LogAndTreeStorageRepository implements Repository, LifecycleAware {
  constructor(readonly moveOpTree: MoveOpTree) {}
  // , readonly eventLog: DEventLog
  async init(): Promise<void> {}

  async deinit(): Promise<void> {}

  async loadNode(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<RepositoryNode> {
    const storedNode = await this.moveOpTree.loadNode(nodeId)
    if (nodeFilter(storedNode)) {
      return storedNode
    } else {
      return null
    }
  }

  async createNode(
    id: string,
    parentId: string,
    name: string,
    content: string,
    synchronous: boolean,
    relativePosition: RelativeNodePosition
  ): Promise<void> {
    await this.moveOpTree.updateNode(
      {
        id: id,
        name: name,
        note: content,
        collapsed: false,
        completed: false,
        deleted: false,
        created: secondsSinceEpoch(),
        updated: secondsSinceEpoch(),
      },
      parentId,
      relativePosition
    )
    // TODO: implement synchronous and asynchronous storage if it becomes relevant
  }

  async updateNode(node: RepositoryNode, parentId: string, synchronous: boolean): Promise<void> {
    await this.moveOpTree.updateNode(node, parentId, RELATIVE_NODE_POSITION_UNCHANGED)
    // TODO: implement synchronous and asynchronous storage if it becomes relevant
  }

  async reparentNode(
    node: RepositoryNode,
    parentId: string,
    position: RelativeNodePosition,
    synchronous: boolean
  ): Promise<void> {
    await this.moveOpTree.updateNode(node, parentId, position)
    // TODO: implement synchronous and asynchronous storage if it becomes relevant
  }

  async getChildIds(nodeId: string): Promise<string[]> {
    throw new Error('Method not implemented.')
  }

  async getParentId(nodeId: string): Promise<string> {
    throw new Error('Method not implemented.')
  }

  async loadTree(
    nodeId: string,
    nodeFilter: Predicate<RepositoryNode>,
    loadCollapsedChildren: boolean
  ): Promise<LoadedTree> {
    throw new Error('Method not implemented.')
  }

  subscribeToChanges(parentNodeId: string, nodeChangeListener: () => void): Subscription {
    return this.moveOpTree.subscribeToSubtreeChanges(parentNodeId, nodeChangeListener)
  }
}

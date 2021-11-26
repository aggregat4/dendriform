import { RelativeNodePosition } from '../domain/domain'
import { LifecycleAware } from '../domain/lifecycle'
import { DEventLog } from '../eventlog/eventlog-domain'
import { MoveOpTree } from '../moveoperation/moveoperation'
import { Predicate } from '../utils/util'
import { LoadedTree, Repository, RepositoryNode } from './repository'

// TODO: most of the real implementation (also subscribe to eventlog to update treeStorageStructure and notify subscribers)
export class LogAndTreeStorageRepository implements Repository, LifecycleAware {
  constructor(readonly moveOpTree: MoveOpTree, readonly eventLog: DEventLog) {}

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
    await this.moveOpTree.createNewNode(id, parentId, name, content, relativePosition)
    // TODO: this is where I left off, I just implemented this (maybe)
    // TODO: write tests for this part (from storage up to here?)?
    // TODO: implement synchronous and non synchronous storage if it becomes relevant
  }

  async updateNode(node: RepositoryNode, parentId: string, synchronous: boolean): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async reparentNode(
    node: RepositoryNode,
    parentId: string,
    position: RelativeNodePosition,
    synchronous: boolean
  ): Promise<void> {
    throw new Error('Method not implemented.')
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

import {
  RelativeNodePosition,
  RELATIVE_NODE_POSITION_UNCHANGED,
  Subscription,
} from '../domain/domain'
import { LifecycleAware } from '../domain/lifecycle'
import { MoveOpTree } from '../moveoperation/moveoperation'
import { secondsSinceEpoch } from '../utils/dateandtime'
import { Predicate } from '../utils/util'
import {
  LoadedTree,
  Repository,
  RepositoryNode,
  ResolvedRepositoryNode,
  State,
  STATUS_LOADED,
  STATUS_NOT_FOUND,
} from './repository'

// TODO: most of the real implementation (also subscribe to eventlog to update treeStorageStructure and notify subscribers)
export class LogAndTreeStorageRepository implements Repository, LifecycleAware {
  constructor(readonly moveOpTree: MoveOpTree) {}

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
    return this.moveOpTree.getChildIds(nodeId)
  }

  async getParentId(nodeId: string): Promise<string> {
    const node = await this.moveOpTree.loadNode(nodeId)
    if (node) {
      return node.parentId
    } else {
      return null
    }
  }

  async loadTree(
    nodeId: string,
    nodeFilter: Predicate<RepositoryNode>,
    loadCollapsedChildren: boolean
  ): Promise<LoadedTree> {
    try {
      const tree = await this.loadTreeRecursive(nodeId, nodeFilter, loadCollapsedChildren)
      if (!tree) {
        return {
          status: STATUS_NOT_FOUND,
        }
      }
      const storedNode = await this.moveOpTree.loadNode(nodeId)
      const ancestors = []
      if (storedNode.parentId) {
        await this.loadAncestors(storedNode.parentId, ancestors)
      }
      return {
        status: STATUS_LOADED,
        tree: tree,
        ancestors: ancestors,
      }
    } catch (e) {
      console.error(`Error loading tree from storage: `, e)
      return { status: { state: State.ERROR, msg: `Error loading tree` } }
    }
  }

  private async loadTreeRecursive(
    nodeId: string,
    nodeFilter: Predicate<RepositoryNode>,
    loadCollapsedChildren: boolean
  ): Promise<ResolvedRepositoryNode> {
    const node = await this.loadNode(nodeId, nodeFilter)
    if (!node) {
      return null
    }
    const childIds = this.getChildIds(node.id)
    if (!node.collapsed || loadCollapsedChildren) {
      // TODO: verify whether we are really deferred here, since we _are_ awaiting the promise, not sure about this
      const children = await Promise.all(
        (
          await childIds
        ).map(
          async (childId) =>
            await this.loadTreeRecursive(childId, nodeFilter, loadCollapsedChildren)
        )
      )
      return {
        node,
        children: { loaded: true, elements: children.filter((c) => !!c) },
      }
    } else {
      return {
        node,
        children: {
          loaded: (await childIds).length === 0 ? true : false,
          elements: [],
        },
      }
    }
  }

  private async loadAncestors(parentId: string, ancestors: RepositoryNode[]) {
    const parent = await this.moveOpTree.loadNode(parentId)
    ancestors.push(parent)
    if (parent.parentId) {
      await this.loadAncestors(parent.parentId, ancestors)
    }
  }

  subscribeToChanges(parentNodeId: string, nodeChangeListener: () => void): Subscription {
    return this.moveOpTree.subscribeToSubtreeChanges(parentNodeId, nodeChangeListener)
  }
}

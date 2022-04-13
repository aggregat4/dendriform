import {
  RelativeNodePosition,
  RELATIVE_NODE_POSITION_UNCHANGED,
  Subscription,
} from '../domain/domain'
import { MoveOpTree } from '../moveoperation/moveoperation'
import { secondsSinceEpoch } from '../utils/dateandtime'
import { assert, Predicate } from '../utils/util'
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
export class LogAndTreeStorageRepository implements Repository {
  constructor(readonly moveOpTree: MoveOpTree) {}

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    synchronous: boolean,
    relativePosition: RelativeNodePosition
  ): Promise<void> {
    await this.moveOpTree.createLocalNode(
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateNode(
    nodeId: string,
    parentId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    synchronous: boolean,
    updateFun: (node: RepositoryNode) => boolean
  ): Promise<void> {
    await this.moveOpTree.updateLocalNode(
      nodeId,
      parentId,
      RELATIVE_NODE_POSITION_UNCHANGED,
      updateFun
    )
    // TODO: implement synchronous and asynchronous storage if it becomes relevant (or delete the concept entirely!)
  }

  async reparentNode(
    nodeId: string,
    parentId: string,
    position: RelativeNodePosition,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    synchronous: boolean
  ): Promise<void> {
    await this.moveOpTree.updateLocalNode(nodeId, parentId, position, () => true)
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
      assert(
        !!storedNode,
        `Since we have just loaded a tree for the node with id ${nodeId}, it must exist`
      )
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
      console.error(`Error loading tree from storage: `, e.toString(), e)
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
    const childIds = await this.getChildIds(node.id)
    if (!node.collapsed || loadCollapsedChildren) {
      const children = await Promise.all(
        childIds.map(
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
          loaded: childIds.length === 0 ? true : false,
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

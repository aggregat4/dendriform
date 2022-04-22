import {
  RelativeLinearPosition,
  RelativeNodePosition,
  RELATIVE_NODE_POSITION_END,
  Subscription,
} from '../domain/domain'
import { LoadedTree, Repository, RepositoryNode, State } from '../repository/repository'
import { ALWAYS_TRUE, Predicate } from '../utils/util'
import { MergeNameOrder } from './service'

export class TreeService {
  constructor(readonly repo: Repository) {}

  async loadTree(
    nodeId: string,
    nodeFilter: Predicate<RepositoryNode>,
    loadCollapsedChildren: boolean
  ): Promise<LoadedTree> {
    const tree = await this.repo.loadTree(nodeId, nodeFilter, loadCollapsedChildren)
    if (tree.status.state === State.NOT_FOUND && nodeId === 'ROOT') {
      // TODO: handle this better. Is this an exception? this used to be initialize empty tree
    } else {
      return tree
    }
  }

  // loads the node by id, renames it and then returns a Promise of a response when done
  async renameNode(nodeId: string, parentId: string, newName: string, synchronous: boolean) {
    await this.repo.updateNode(nodeId, parentId, synchronous, (node: RepositoryNode) => {
      if (node.name === newName) {
        return false
      } else {
        node.name = newName
        return true
      }
    })
  }

  async loadNode(nodeId: string): Promise<RepositoryNode> {
    // console.log(`getNode for id '${nodeId}'`)
    return this.repo.loadNode(nodeId, ALWAYS_TRUE)
  }

  async reparentNode(
    nodeId: string,
    newParentId: string,
    position: RelativeNodePosition,
    synchronous: boolean
  ) {
    return await this.repo.reparentNode(nodeId, newParentId, position, synchronous)
  }

  async reparentNodes(childIds: string[], newParentId: string, synchronous: boolean) {
    if (!childIds) {
      return
    }
    let sequentialPromise = Promise.resolve()
    for (const childId of childIds) {
      sequentialPromise = sequentialPromise.then(() =>
        this.reparentNode(
          childId,
          newParentId,
          { nodeId: null, beforeOrAfter: RelativeLinearPosition.END },
          synchronous
        )
      )
    }
    return sequentialPromise
  }

  async deleteNode(nodeId: string, parentId: string, synchronous: boolean) {
    await this.updateNode(nodeId, parentId, synchronous, (node: RepositoryNode) => {
      node.deleted = true
      return true
    })
  }

  // undeletes a node, just removing its deleted flag
  async undeleteNode(nodeId: string, parentId: string, synchronous: boolean) {
    await this.updateNode(nodeId, parentId, synchronous, (node: RepositoryNode) => {
      node.deleted = false
      return true
    })
  }

  async completeNode(nodeId: string, parentId: string, synchronous: boolean) {
    await this.updateNode(nodeId, parentId, synchronous, (node: RepositoryNode) => {
      node.completed = true
      return true
    })
  }

  async unCompleteNode(nodeId: string, parentId: string, synchronous: boolean) {
    await this.updateNode(nodeId, parentId, synchronous, (node: RepositoryNode) => {
      node.completed = false
      return true
    })
  }

  async openNode(nodeId: string, parentId: string, synchronous: boolean) {
    await this.updateNode(nodeId, parentId, synchronous, (node: RepositoryNode) => {
      node.collapsed = false
      return true
    })
  }

  async closeNode(nodeId: string, parentId: string, synchronous: boolean) {
    await this.updateNode(nodeId, parentId, synchronous, (node: RepositoryNode) => {
      node.collapsed = true
      return true
    })
  }

  async updateNote(nodeId: string, parentId: string, note: string, synchronous: boolean) {
    await this.updateNode(nodeId, parentId, synchronous, (node: RepositoryNode) => {
      node.note = note
      return true
    })
  }

  private async updateNode(
    nodeId: string,
    parentId: string,
    synchronous: boolean,
    updateFun: (node: RepositoryNode) => boolean
  ) {
    await this.repo.updateNode(nodeId, parentId, synchronous, updateFun)
  }

  /**
   * Splitting means that the current node is renamed to the name AFTER the
   * split position and a new node is inserted BEFORE the current node that
   * contains the name BEFORE the split position.
   */
  async splitNode(
    nodeId: string,
    parentId: string,
    nodeName: string,
    newSiblingId: string,
    newSiblingName: string,
    synchronous: boolean
  ) {
    const sibling = await this.findNode(newSiblingId)
    if (sibling) {
      // we need to attempt undelete since this may be an undo operation of a merge, in this case the sibling exists
      await this.undeleteNode(newSiblingId, parentId, synchronous)
    } else {
      await this.repo.createNode(newSiblingId, parentId, newSiblingName, null, synchronous, {
        nodeId,
        beforeOrAfter: RelativeLinearPosition.BEFORE,
      })
    }
    await this.renameNode(nodeId, parentId, nodeName, synchronous)
  }

  private async findNode(nodeId: string): Promise<RepositoryNode> {
    return this.repo.loadNode(nodeId, ALWAYS_TRUE)
  }

  // 1. rename targetnode to be targetnode.name + sourcenode.name
  // 2. move all children of sourcenode to targetnode (actual move, just reparent)
  // 3. delete sourcenode
  // 4. focus the new node at the end of its old name
  //
  // For undo it is assumed that a merge never happens to a target node with children
  // This function will not undo the merging of the child collections (this mirrors workflowy
  // maybe we want to revisit this in the future)
  async mergeNodes(
    sourceNodeId: string,
    sourceNodeName: string,
    sourceParentId: string,
    targetNodeId: string,
    targetNodeName: string,
    targetParentId: string,
    mergeNameOrder: MergeNameOrder,
    synchronous: boolean
  ) {
    const childIds = await this.repo.getChildIds(sourceNodeId)
    await this.reparentNodes(childIds, targetNodeId, synchronous)
    await this.renameNode(
      targetNodeId,
      targetParentId,
      mergeNameOrder === MergeNameOrder.SOURCE_TARGET
        ? sourceNodeName + targetNodeName
        : targetNodeName + sourceNodeName,
      synchronous
    )
    await this.deleteNode(sourceNodeId, sourceParentId, synchronous)
  }

  subscribeToChanges(parentNodeId: string, nodeChangeListener: () => void): Subscription {
    return this.repo.subscribeToChanges(parentNodeId, nodeChangeListener)
  }

  async createChildNode(
    childId: string,
    childName: string,
    childNote: string,
    parentId: string,
    synchronous: boolean
  ) {
    await this.repo.createNode(
      childId,
      parentId,
      childName,
      childNote,
      synchronous,
      RELATIVE_NODE_POSITION_END
    )
  }
}

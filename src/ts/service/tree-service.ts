import { ALWAYS_TRUE, Predicate } from '../utils/util'
import {
  RelativeLinearPosition,
  RelativeNodePosition,
  RELATIVE_NODE_POSITION_END,
  Subscription,
} from '../domain/domain'
import {
  LoadedTree,
  NODE_IS_NOT_DELETED,
  Repository,
  RepositoryNode,
  State,
} from '../repository/repository'
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
  async renameNode(
    nodeId: string,
    parentId: string,
    newName: string,
    synchronous: boolean
  ): Promise<void> {
    return this.repo.loadNode(nodeId, NODE_IS_NOT_DELETED).then((node) => {
      if (newName !== node.name) {
        node.name = newName
        return this.repo.updateNode(node, parentId, synchronous)
      }
    })
  }

  createNode(
    id: string,
    parentId: string,
    name: string,
    content: string,
    synchronous: boolean
  ): Promise<void> {
    return this.repo.createNode(
      id,
      parentId,
      name,
      content,
      synchronous,
      RELATIVE_NODE_POSITION_END
    )
  }

  loadNode(nodeId: string): Promise<RepositoryNode> {
    // console.log(`getNode for id '${nodeId}'`)
    return this.repo.loadNode(nodeId, ALWAYS_TRUE)
  }

  reparentNode(
    nodeId: string,
    newParentId: string,
    position: RelativeNodePosition,
    synchronous: boolean
  ): Promise<void> {
    return this.repo
      .loadNode(nodeId, NODE_IS_NOT_DELETED)
      .then((node) => this.repo.reparentNode(node, newParentId, position, synchronous))
  }

  reparentNodes(childIds: string[], newParentId: string, synchronous: boolean): Promise<void> {
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

  deleteNode(nodeId: string, parentId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(
      nodeId,
      parentId,
      synchronous,
      (node: RepositoryNode) => (node.deleted = true)
    )
  }

  // undeletes a node, just removing its deleted flag
  undeleteNode(nodeId: string, parentId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(
      nodeId,
      parentId,
      synchronous,
      (node: RepositoryNode) => (node.deleted = false)
    )
  }

  completeNode(nodeId: string, parentId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(
      nodeId,
      parentId,
      synchronous,
      (node: RepositoryNode) => (node.completed = true)
    )
  }

  unCompleteNode(nodeId: string, parentId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(
      nodeId,
      parentId,
      synchronous,
      (node: RepositoryNode) => (node.completed = false)
    )
  }

  openNode(nodeId: string, parentId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(
      nodeId,
      parentId,
      synchronous,
      (node: RepositoryNode) => (node.collapsed = false)
    )
  }

  closeNode(nodeId: string, parentId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(
      nodeId,
      parentId,
      synchronous,
      (node: RepositoryNode) => (node.collapsed = true)
    )
  }

  updateNote(nodeId: string, parentId: string, note: string, synchronous: boolean): Promise<void> {
    return this.updateNode(
      nodeId,
      parentId,
      synchronous,
      (node: RepositoryNode) => (node.note = note)
    )
  }

  private async updateNode(
    nodeId: string,
    parentId: string,
    synchronous: boolean,
    updateFun: (node: RepositoryNode) => void
  ): Promise<void> {
    return this.repo.loadNode(nodeId, ALWAYS_TRUE).then((node) => {
      if (node) {
        updateFun(node)
        return this.repo.updateNode(node, parentId, synchronous)
      } else {
        throw new Error(`Node with id ${nodeId} does not exist`)
      }
    })
  }

  // 1. rename the current node to the right hand side of the split
  // 2. insert a new sibling BEFORE the current node containing the left hand side of the split
  async splitNode(
    nodeId: string,
    parentId: string,
    nodeName: string,
    newSiblingId: string,
    newSiblingName: string,
    synchronous: boolean
  ): Promise<void> {
    return this.findNode(newSiblingId)
      .then(async (sibling) => {
        if (sibling) {
          // we need to attempt undelete since this may be an undo operation of a merge, in this case the sibling exists
          return this.undeleteNode(newSiblingId, parentId, synchronous)
        } else {
          return this.createNode(newSiblingId, parentId, newSiblingName, null, synchronous)
            .then(() => this.repo.getParentId(nodeId))
            .then((parentId) =>
              this.reparentNode(
                newSiblingId,
                parentId,
                { nodeId, beforeOrAfter: RelativeLinearPosition.BEFORE },
                synchronous
              )
            )
        }
      })
      .then(() => this.repo.getChildIds(nodeId))
      .then((childIds) => this.reparentNodes(childIds, newSiblingId, synchronous))
      .then(async () => {
        await this.renameNode(nodeId, parentId, nodeName, synchronous)
      })
  }

  private findNode(nodeId: string): Promise<RepositoryNode> {
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
  ): Promise<void> {
    await this.repo
      .getChildIds(sourceNodeId)
      .then((childIds) => this.reparentNodes(childIds, targetNodeId, synchronous))
      .then(() =>
        this.renameNode(
          targetNodeId,
          targetParentId,
          mergeNameOrder === MergeNameOrder.SOURCE_TARGET
            ? sourceNodeName + targetNodeName
            : targetNodeName + sourceNodeName,
          synchronous
        )
      )
      .then(() => this.deleteNode(sourceNodeId, sourceParentId, synchronous))
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
  ): Promise<void> {
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

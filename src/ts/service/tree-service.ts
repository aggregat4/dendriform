import { ALWAYS_TRUE, Predicate } from '../utils/util'
import {
  RelativeLinearPosition,
  RepositoryNode,
  LoadedTree,
  State,
  RelativeNodePosition,
  NODE_IS_NOT_DELETED,
  Subscription,
  LifecycleAware,
} from '../domain/domain'
import { Repository } from '../repository/repository'
import { MergeNameOrder } from './service'

export class TreeService implements LifecycleAware {
  constructor(readonly repo: Repository) {}

  async init(): Promise<void> {
    await this.repo.init()
  }

  async deinit(): Promise<void> {
    await this.repo.deinit()
  }

  loadTree(nodeId: string, nodeFilter: Predicate<RepositoryNode>, loadCollapsedChildren: boolean): Promise<LoadedTree> {
    return this.repo.loadTree(nodeId, nodeFilter, loadCollapsedChildren)
      .then((tree) => {
        if (tree.status.state === State.NOT_FOUND && nodeId === 'ROOT') {
          // TODO: handle this better. Is this an exception? this used to be initialize empty tree
        } else {
          return tree
        }
      })
  }

  // loads the node by id, renames it and then returns a Promise of a response when done
  async renameNode(nodeId: string, newName: string, synchronous: boolean): Promise<void> {
    return this.repo.loadNode(nodeId, NODE_IS_NOT_DELETED)
      .then(node => {
        if (newName !== node.name) {
          node.name = newName
          return this.repo.updateNode(node, synchronous)
        }
      })
  }

  createNode(id: string, name: string, content: string, synchronous: boolean): Promise<void> {
    return this.repo.createNode(id, name, content, synchronous)
  }

  loadNode(nodeId: string): Promise<RepositoryNode> {
    // console.log(`getNode for id '${nodeId}'`)
    return this.repo.loadNode(nodeId, ALWAYS_TRUE)
  }

  reparentNode(nodeId: string, newParentId: string, position: RelativeNodePosition, synchronous: boolean): Promise<void> {
    return this.repo.reparentNode(nodeId, newParentId, position, synchronous)
  }

  reparentNodes(childIds: string[], newParentId: string, synchronous: boolean): Promise<void> {
    if (!childIds) {
      return
    }
    let sequentialPromise = Promise.resolve()
    for (const childId of childIds) {
      sequentialPromise = sequentialPromise
        .then(() => this.repo.reparentNode(childId, newParentId,
          {nodeId: null, beforeOrAfter: RelativeLinearPosition.END}, synchronous))
    }
    return sequentialPromise
  }

  deleteNode(nodeId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(nodeId, synchronous, (node: RepositoryNode) => node.deleted = true)
  }

  // undeletes a node, just removing its deleted flag
  undeleteNode(nodeId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(nodeId, synchronous, (node: RepositoryNode) => node.deleted = false)
  }

  completeNode(nodeId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(nodeId, synchronous, (node: RepositoryNode) => node.completed = true)
  }

  unCompleteNode(nodeId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(nodeId, synchronous, (node: RepositoryNode) => node.completed = false)
  }

  openNode(nodeId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(nodeId, synchronous, (node: RepositoryNode) => node.collapsed = false)
  }

  closeNode(nodeId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(nodeId, synchronous, (node: RepositoryNode) => node.collapsed = true)
  }

  updateNote(nodeId: string, note: string, synchronous: boolean): Promise<void> {
    return this.updateNode(nodeId, synchronous, (node: RepositoryNode) => node.note = note)
  }

  private async updateNode(nodeId: string, synchronous: boolean, updateFun: (node: RepositoryNode) => void): Promise<void> {
    return this.repo.loadNode(nodeId, ALWAYS_TRUE)
      .then(node => {
        if (node) {
          updateFun(node)
          return this.repo.updateNode(node, synchronous)
        } else {
          throw new Error(`Node with id ${nodeId} does not exist`)
        }
      })

  }

  // 1. rename the current node to the right hand side of the split
  // 2. insert a new sibling BEFORE the current node containing the left hand side of the split
  async splitNode(nodeId: string, nodeName: string, newSiblingId: string, newSiblingName: string, synchronous: boolean): Promise<void> {
    return this.findNode(newSiblingId)
      .then(async sibling => {
        if (sibling) {
          // we need to attempt undelete since this may be an undo operation of a merge, in this case the sibling exists
          return this.undeleteNode(newSiblingId, synchronous)
        } else {
          return this.createNode(newSiblingId, newSiblingName, null, synchronous)
            .then(() => this.repo.getParentId(nodeId))
            .then(parentId =>
              this.reparentNode(newSiblingId, parentId, {nodeId, beforeOrAfter: RelativeLinearPosition.BEFORE}, synchronous))
        }
      })
      .then(() => this.repo.getChildIds(nodeId))
      .then(childIds => this.reparentNodes(childIds, newSiblingId, synchronous))
      .then(async () => {
        await this.renameNode(nodeId, nodeName, synchronous)
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
  async mergeNodes(sourceNodeId: string, sourceNodeName: string,
             targetNodeId: string, targetNodeName: string, mergeNameOrder: MergeNameOrder, synchronous: boolean): Promise<void> {
    await this.repo.getChildIds(sourceNodeId)
      .then(childIds => this.reparentNodes(childIds, targetNodeId, synchronous))
      .then(() => this.renameNode(
        targetNodeId,
        mergeNameOrder === MergeNameOrder.SOURCE_TARGET ?
          sourceNodeName + targetNodeName : targetNodeName + sourceNodeName,
        synchronous))
      .then(() => this.deleteNode(sourceNodeId, synchronous))
  }

  subscribeToChanges(parentNodeId: string, nodeChangeListener: (nodeId: string) => void): Subscription {
    return this.repo.subscribeToChanges(parentNodeId, nodeChangeListener)
  }

  async createChildNode(childId: string, childName: string, childNote: string, parentId: string, synchronous: boolean): Promise<void> {
    await this.repo.createNode(childId, childName, childNote, synchronous)
      .then(() => this.repo.reparentNode(childId, parentId, { beforeOrAfter: RelativeLinearPosition.END }, synchronous))
  }

}

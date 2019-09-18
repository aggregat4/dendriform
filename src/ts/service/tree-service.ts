import { generateUUID, ALWAYS_TRUE, Predicate } from '../utils/util'
import {
  RelativeLinearPosition,
  RepositoryNode,
  LoadedTree,
  State,
  RelativeNodePosition,
  NODE_IS_NOT_DELETED,
  Subscription,
} from '../domain/domain'
import { Repository } from '../repository/repository'
import { MergeNameOrder } from './service'

export class TreeService {
  constructor(readonly repo: Repository) {}

  loadTree(nodeId: string, nodeFilter: Predicate<RepositoryNode>, loadCollapsedChildren: boolean): Promise<LoadedTree> {
    return this.repo.loadTree(nodeId, nodeFilter, loadCollapsedChildren)
      .then((tree) => {
        if (tree.status.state === State.NOT_FOUND && nodeId === 'ROOT') {
          return this.initializeEmptyTree().then(() => this.repo.loadTree(nodeId, nodeFilter, loadCollapsedChildren))
        } else {
          return tree
        }
      })
  }

  /**
   * Initializing the empty tree performs all updates synchronously so that we can be sure
   * the nodes exist when we return. Otherwise the caller may not known when to actually
   * draw the tree.
   */
  private initializeEmptyTree(): Promise<void> {
    const newId = generateUUID()
    return this.repo.createNode('ROOT', 'ROOT', null, true)
      .then(() => this.repo.createNode(newId, '', null, true))
      .then(() => this.repo.reparentNode(newId, 'ROOT', {beforeOrAfter: RelativeLinearPosition.END}, true))
  }

  // loads the node by id, renames it and then returns a Promise of a response when done
  renameNode(nodeId: string, newName: string, synchronous): Promise<any> {
    return this.repo.loadNode(nodeId, NODE_IS_NOT_DELETED)
      .then(node => {
        if (newName !== node.name) {
          node.name = newName
          return this.repo.updateNode(node, synchronous)
        } else {
          return Promise.resolve()
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

  reparentNode(nodeId: string, newParentId: string, position: RelativeNodePosition, synchronous: boolean): Promise<any> {
    return this.repo.reparentNode(nodeId, newParentId, position, synchronous)
  }

  reparentNodes(childIds: string[], newParentId: string, synchronous: boolean): Promise<any> {
    if (!childIds) {
      return Promise.resolve()
    }
    let sequentialPromise = Promise.resolve()
    for (const childId of childIds) {
      sequentialPromise = sequentialPromise
        .then(() => this.repo.reparentNode(childId, newParentId,
          {nodeId: null, beforeOrAfter: RelativeLinearPosition.END}, synchronous))
    }
    return sequentialPromise
  }

  deleteNode(nodeId: string, synchronous: boolean): Promise<any> {
    return this.updateNode(nodeId, synchronous, (node) => node.deleted = true)
  }

  // undeletes a node, just removing its deleted flag
  undeleteNode(nodeId: string, synchronous: boolean): Promise<any> {
    return this.updateNode(nodeId, synchronous, (node) => node.deleted = false)
  }

  completeNode(nodeId: string, synchronous: boolean): Promise<any> {
    return this.updateNode(nodeId, synchronous, (node) => node.completed = true)
  }

  unCompleteNode(nodeId: string, synchronous: boolean): Promise<any> {
    return this.updateNode(nodeId, synchronous, (node) => node.completed = false)
  }

  openNode(nodeId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(nodeId, synchronous, (node) => node.collapsed = false)
  }

  closeNode(nodeId: string, synchronous: boolean): Promise<void> {
    return this.updateNode(nodeId, synchronous, (node) => node.collapsed = true)
  }

  updateNote(nodeId: string, note: string, synchronous: boolean): Promise<void> {
    return this.updateNode(nodeId, synchronous, (node) => node.note = note)
  }

  private updateNode(nodeId: string, synchronous: boolean, updateFun: (node) => void): Promise<any> {
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
  splitNode(nodeId: string, nodeName: string, newSiblingId: string, newSiblingName: string, synchronous: boolean): Promise<any> {
    return this.findNode(newSiblingId)
      .then(sibling => {
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
      .then(() => this.renameNode(nodeId, nodeName, synchronous))
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
  mergeNodes(sourceNodeId: string, sourceNodeName: string,
             targetNodeId: string, targetNodeName: string, mergeNameOrder: MergeNameOrder, synchronous: boolean): Promise<any> {
    return this.repo.getChildIds(sourceNodeId)
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

  createChildNode(childId: string, childName: string, childNote: string, parentId: string, synchronous: boolean): Promise<any> {
    return this.repo.createNode(childId, childName, childNote, synchronous)
      .then(() => this.repo.reparentNode(childId, parentId, { beforeOrAfter: RelativeLinearPosition.END }, synchronous))
  }

}

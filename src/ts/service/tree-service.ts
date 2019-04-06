import {generateUUID, ALWAYS_TRUE} from '../util'
import {
  RelativeLinearPosition,
  RepositoryNode,
  LoadedTree,
  State,
  RelativeNodePosition,
  nodeIsNotDeleted,
  Subscription,
} from '../domain/domain'
import {Repository} from '../repository/repository'
import { MergeNameOrder } from './service'

export class TreeService {
  constructor(readonly repo: Repository) {}

  loadTree(nodeId: string): Promise<LoadedTree> {
    return this.repo.loadTree(nodeId, ALWAYS_TRUE)
      .then((tree) => {
        if (tree.status.state === State.NOT_FOUND && nodeId === 'ROOT') {
          return this.initializeEmptyTree().then(() => this.repo.loadTree(nodeId, ALWAYS_TRUE))
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
    return this.repo.loadNode(nodeId, nodeIsNotDeleted)
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

  getNode(nodeId: string): Promise<RepositoryNode> {
    // console.log(`getNode for id '${nodeId}'`)
    return this.repo.loadNode(nodeId, nodeIsNotDeleted)
  }

  findNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode> {
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

  // deletes a node, this just sets a deleted flag to true
  deleteNode(nodeId: string, synchronous: boolean): Promise<any> {
    return this.repo.loadNode(nodeId, nodeIsNotDeleted)
      .then(node => {
        node.deleted = true
        return this.repo.updateNode(node, synchronous)
      })
  }

  // undeletes a node, just removing its deleted flag
  undeleteNode(nodeId: string, synchronous: boolean): Promise<any> {
    return this.repo.loadNode(nodeId, ALWAYS_TRUE)
      .then(node => {
        if (node) {
          delete node.deleted // removing this flag from the object since it is not required anymore
          return this.repo.updateNode(node, synchronous)
        } else {
          throw new Error(`Node with id ${nodeId} does not exist`)
        }
      })
  }

  openNode(nodeId: string, synchronous: boolean): Promise<void> {
    return this.repo.loadNode(nodeId, nodeIsNotDeleted)
      .then(node => {
        if (node.collapsed) {
          delete node.collapsed
        }
        return this.repo.updateNode(node, synchronous)
      })
  }

  closeNode(nodeId: string, synchronous: boolean): Promise<void> {
    return this.repo.loadNode(nodeId, nodeIsNotDeleted)
      .then(node => {
        node.collapsed = true
        return this.repo.updateNode(node, synchronous)
      })
  }

  updateNote(nodeId: string, note: string, synchronous: boolean): Promise<void> {
    return this.repo.loadNode(nodeId, nodeIsNotDeleted)
      .then(node => {
        node.content = note
        return this.repo.updateNode(node, synchronous)
      })
  }

  // 1. rename the current node to the right hand side of the split
  // 2. insert a new sibling BEFORE the current node containing the left hand side of the split
  splitNode(nodeId: string, nodeName: string, newSiblingId: string, newSiblingName: string, synchronous: boolean): Promise<any> {
    return this.findNode(newSiblingId, true)
      .then(sibling => {
        if (sibling) {
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

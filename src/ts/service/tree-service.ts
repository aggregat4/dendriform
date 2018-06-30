import {generateUUID} from '../util'
import {
  RelativeLinearPosition,
  RepositoryNode,
  LoadedTree,
  State,
  RelativeNodePosition,
  MergeNameOrder,
} from '../domain/domain'
import {Repository} from '../repository/repository'

export class TreeService {
  constructor(readonly repo: Repository) {}

  loadTree(nodeId: string): Promise<LoadedTree> {
    return this.loadTreeByRootId(nodeId)
      .then((tree) => {
        if (tree.status.state === State.NOT_FOUND && nodeId === 'ROOT') {
          return this.initializeEmptyTree().then(() => this.loadTreeByRootId(nodeId))
        } else {
          return tree
        }
      })
  }

  private loadTreeByRootId(rootId: string): Promise<LoadedTree> {
    return this.repo.loadNode(rootId, false)
      .then(root => {
        if (root) {
          return this.repo.loadTree(root)
        } else {
          return {status: {state: State.NOT_FOUND}}
        }
      })
  }

  private initializeEmptyTree(): Promise<void> {
    return this.repo.createNode('ROOT', 'ROOT', null)
      .then(() => this.repo.createNode(generateUUID(), '', null))
      .then(child => this.addChildToParent(child._id, 'ROOT'))
  }

  // loads the node by id, renames it and then returns a Promise of a response when done
  renameNode(nodeId: string, newName: string): Promise<any> {
    return this.repo.loadNode(nodeId, false)
      .then(node => {
        if (newName !== node.name) {
          node.name = newName
          return this.repo.putNode(node)
        } else {
          return Promise.resolve()
        }
      })
  }

  createNode(id: string, name: string, content: string): Promise<RepositoryNode> {
    return this.repo.createNode(id, name, content)
  }

  getNode(nodeId: string): Promise<RepositoryNode> {
    // console.log(`getNode for id '${nodeId}'`)
    return this.repo.loadNode(nodeId, false)
  }

  findNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode> {
    // console.log(`getNode for id '${nodeId}'`)
    return this.repo.loadNode(nodeId, includeDeleted)
  }

  reparentNode(nodeId: string, newParentId: string, position: RelativeNodePosition): Promise<any> {
    return this.getNode(nodeId).then(node => this.repo.reparentNode(node, newParentId, position))
  }

  reparentNodes(children: RepositoryNode[], newParentId: string): Promise<any> {
    if (!children || children.length === 0) {
      return Promise.resolve()
    }
    let sequentialPromise = Promise.resolve()
    for (const child of children) {
      sequentialPromise = sequentialPromise
        .then(() => this.repo.reparentNode(child, newParentId,
          {nodeId: null, beforeOrAfter: RelativeLinearPosition.END}))
    }
    return sequentialPromise
  }

  // deletes a node, this just sets a deleted flag to true
  deleteNode(nodeId: string): Promise<any> {
    return this.repo.loadNode(nodeId, false)
      .then(node => {
        node.deleted = true
        return this.repo.putNode(node)
      })
  }

  // undeletes a node, just removing its deleted flag
  undeleteNode(nodeId: string): Promise<any> {
    return this.repo.loadNode(nodeId, true)
      .then(node => {
        if (node) {
          delete node.deleted // removing this flag from the object since it is not required anymore
          return this.repo.putNode(node)
        } else {
          throw new Error(`Node with id ${nodeId} does not exist`)
        }
      })
  }

  // Returns a promise of the parent node
  private addChildToParent(childId: string, parentId: string): Promise<void> {
    // console.log(`addChildToParent ${childId} -> ${parentId}`)
    return this.repo.loadNode(childId, false)
      .then(child => {
        child.parentref = parentId
        return this.repo.putNode(child)
      })
      .then(() =>
        this.repo.loadNode(parentId, false)
          .then(parent => {
            parent.childrefs.push(childId)
            return this.repo.putNode(parent)
          }),
      )
  }

  openNode(nodeId: string): Promise<void> {
    return this.repo.loadNode(nodeId, false)
      .then(node => {
        if (node.collapsed) {
          delete node.collapsed
        }
        return this.repo.putNode(node)
      })
  }

  closeNode(nodeId: string): Promise<void> {
    return this.repo.loadNode(nodeId, false)
      .then(node => {
        node.collapsed = true
        return this.repo.putNode(node)
      })
  }

  updateNote(nodeId: string, note: string): Promise<void> {
    return this.repo.loadNode(nodeId, false)
      .then(node => {
        node.content = note
        return this.repo.putNode(node)
      })
  }

  // 1. rename the current node to the right hand side of the split
  // 2. insert a new sibling BEFORE the current node containing the left hand side of the split
  splitNode(nodeId: string, nodeName: string, newSiblingId: string, newSiblingName: string): Promise<any> {
    return this.findNode(newSiblingId, true)
      .then(sibling => {
        if (sibling) {
          return this.undeleteNode(newSiblingId)
        } else {
          return this.createNode(newSiblingId, newSiblingName, null)
            .then(siblingNode =>
              this.getNode(nodeId)
                .then(originalNode =>
                  this.reparentNode(newSiblingId, originalNode.parentref,
                    {nodeId: originalNode._id, beforeOrAfter: RelativeLinearPosition.BEFORE})))
        }
      })
      .then(() => this.getChildNodes(nodeId, true))
      .then(children => this.reparentNodes(children, newSiblingId))
      .then(() => this.renameNode(nodeId, nodeName))
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
             targetNodeId: string, targetNodeName: string, mergeNameOrder: MergeNameOrder): Promise<any> {
    return this.getChildNodes(sourceNodeId, true)
      .then(children => this.reparentNodes(children, targetNodeId))
      .then(() => this.renameNode(
        targetNodeId,
        mergeNameOrder === MergeNameOrder.SOURCE_TARGET ?
          sourceNodeName + targetNodeName : targetNodeName + sourceNodeName))
      .then(() => this.deleteNode(sourceNodeId))
  }

  private getChildNodes(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode[]> {
    return this.repo.loadNode(nodeId, includeDeleted).then(node => this.repo.loadChildren(node, includeDeleted))
  }

}

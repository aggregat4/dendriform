import {generateUUID} from '../util'
import {
  RelativeLinearPosition,
  RepositoryNode,
  ResolvedRepositoryNode,
  RelativeNodePosition,
  LoadedTree,
  State,
  Status,
} from '../domain/domain'
import {Repository} from '../repository/repository'

export class RepositoryService {
  constructor(readonly repo: Repository) {}

  loadTreeByRootId(rootId: string): Promise<LoadedTree> {
    return this.repo.cdbLoadNode(rootId, false).then(root => {
      if (root) {
        return this.repo.cdbLoadTree(root)
      } else {
        return {status: {state: State.NOT_FOUND}}
      }
    })
  }

  initializeEmptyTree(): Promise<void> {
    return this.repo.cdbCreateNode('ROOT', 'ROOT', null)
      .then(() => this.repo.cdbCreateNode(generateUUID(), '', null))
      .then(child => this.addChildToParent(child._id, 'ROOT'))
  }

  // loads the node by id, renames it and then returns a Promise of a response when done
  renameNode(nodeId: string, newName: string): Promise<any> {
    return this.repo.cdbLoadNode(nodeId, false)
      .then(node => {
        if (newName !== node.name) {
          this.repo.cdbPutNode({
            _id: node._id,
            _rev: node._rev,
            name: newName,
            content: node.content,
            childrefs: node.childrefs,
            parentref: node.parentref,
            deleted: !!node.deleted,
            collapsed: !!node.collapsed,
          })
        } else {
          // tslint:disable-next-line:no-console
          console.log(`not actually renaming since "${newName}" was already set`)
        }
      })
  }

  createSibling(siblingId: string, name: string, content: string, existingNodeId: string,
                before: boolean): Promise<RepositoryNode> {
    return this.repo.cdbLoadNode(existingNodeId, true)
      .then(sibling => {
        return this.repo.cdbCreateNode(siblingId, name, content)
          .then(newSibling => {
            // console.log(`created sibling with ID ${siblingId}`)
            newSibling.parentref = sibling.parentref
            return this.repo.cdbPutNode(newSibling)
              .then(putResult => {
                  // TODO: consider merging this logic with addChildToParent, it is a bit weird here
                  // This is a bit tricky: we want to return the new sibling node, but we also have to make sure
                  // it is a child of its parent. So by using Promise.all we're forcing the parenting to happen
                  // and we are able to nevertheless return the new sibling node
                  return this.repo.cdbLoadNode(sibling.parentref, true)
                    .then(parent => {
                      if (before) {
                        parent.childrefs.splice(parent.childrefs.indexOf(existingNodeId), 0, newSibling._id)
                      } else {
                        parent.childrefs.splice(parent.childrefs.indexOf(existingNodeId) + 1, 0, newSibling._id)
                      }
                      return this.repo.cdbPutNode(parent)
                    })
                    .then(result => Promise.resolve(newSibling))
              })
          })
      })
  }

  getNode(nodeId: string): Promise<RepositoryNode> {
    // console.log(`getNode for id '${nodeId}'`)
    return this.repo.cdbLoadNode(nodeId, false)
  }

  findNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode> {
    // console.log(`getNode for id '${nodeId}'`)
    return this.repo.cdbLoadNode(nodeId, includeDeleted)
  }

  getChildNodes(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode[]> {
    return this.repo.cdbLoadNode(nodeId, includeDeleted).then(node => this.repo.cdbLoadChildren(node, includeDeleted))
  }

  // takes an array of _actual_ nodes and a new parent id, then it reparents those nodes by:
  // 1. removing them from their parent childrefs
  // 2. updating their parentref to their parent's ref
  // 3. adding the children to their new parents childrefs
  // If an afterNodeId is provided the nodes are inserted after that child of the new parent
  // TODO: this function gets used to jsut move nodes inside of the same parent as well,
  // theoretically we could optimise this by distinguishing between the case where the
  // new parent is new and the case where the parent is the same. Or we introduce a new
  // function just for that?
  reparentNodes(children: RepositoryNode[], newParentId: string,
                position: RelativeNodePosition): Promise<any> {
    if (!children || children.length === 0) {
      return Promise.resolve()
    }
    const childIds = children.map(child => child._id)
    const oldParentId = children[0].parentref
    const reparentedChildren = children.map(child => {
      return {
        _id: child._id,
        _rev: child._rev,
        name: child.name,
        content: child.content,
        childrefs: child.childrefs,
        parentref: newParentId,
        deleted: !!child.deleted,
        collapsed: !!child.collapsed,
      }
    })
    return this.repo.cdbLoadNode(oldParentId, false)
      // 1. Remove the children to move from their parent
      .then(oldParentNode => this.repo.cdbPutNode({
        _id: oldParentNode._id,
        _rev: oldParentNode._rev,
        name: oldParentNode.name,
        content: oldParentNode.content,
        parentref: oldParentNode.parentref,
        // remove all the children from their parent
        childrefs: oldParentNode.childrefs.filter((c) => childIds.indexOf(c) < 0),
        deleted: !!oldParentNode.deleted,
        collapsed: !!oldParentNode.collapsed,
      }))
      // 2.a. Hang the children under their new parent by updating their parent refs
      .then(oldParentUpdateResult => this.repo.cdbSaveAll(reparentedChildren))
      // 2.b. and by adding them to the childrefs of the new parent
      .then(bulkUpdateChildrenResult => this.repo.cdbLoadNode(newParentId, false))
      .then(newParentNode => this.repo.cdbPutNode({
        _id: newParentNode._id,
        _rev: newParentNode._rev,
        name: newParentNode.name,
        content: newParentNode.content,
        parentref: newParentNode.parentref,
        // add all the new children to the new parent
        childrefs: this.mergeNodeIds(newParentNode.childrefs || [], childIds, position),
        deleted: !!newParentNode.deleted,
        collapsed: !!newParentNode.collapsed,
      }))
  }

  // deletes a node, this just sets a deleted flag to true
  deleteNode(nodeId: string): Promise<any> {
    return this.repo.cdbLoadNode(nodeId, false)
      .then(node => {
        node.deleted = true
        return this.repo.cdbPutNode(node)
      })
  }

  // undeletes a node, just removing its deleted flag
  undeleteNode(nodeId: string): Promise<any> {
    return this.repo.cdbLoadNode(nodeId, true)
      .then(node => {
        if (node) {
          delete node.deleted // removing this flag from the object since it is not required anymore
          return this.repo.cdbPutNode(node)
        } else {
          throw new Error(`Node with id ${nodeId} does not exist`)
        }
      })
  }

  // Returns a promise of the parent node
  addChildToParent(childId: string, parentId: string): Promise<void> {
    // console.log(`addChildToParent ${childId} -> ${parentId}`)
    return this.repo.cdbLoadNode(childId, false)
      .then(child => {
        child.parentref = parentId
        return this.repo.cdbPutNode(child)
      })
      .then(putResult =>
        this.repo.cdbLoadNode(parentId, false)
          .then(parent => {
            parent.childrefs.push(childId)
            return this.repo.cdbPutNode(parent)
          }),
      )
  }

  openNode(nodeId: string): Promise<void> {
    return this.repo.cdbLoadNode(nodeId, false)
      .then(node => {
        if (node.collapsed) {
          delete node.collapsed
        }
        return this.repo.cdbPutNode(node)
      })
  }

  closeNode(nodeId: string): Promise<void> {
    return this.repo.cdbLoadNode(nodeId, false)
      .then(node => {
        node.collapsed = true
        return this.repo.cdbPutNode(node)
      })
  }

  private mergeNodeIds(originalChildIds: string[], newChildIds: string[], position: RelativeNodePosition): string[] {
    if (position.beforeOrAfter === RelativeLinearPosition.END) {
      return originalChildIds.concat(newChildIds)
    } else if (position.beforeOrAfter === RelativeLinearPosition.BEGINNING) {
      return newChildIds.concat(originalChildIds)
    } else {
      const pos = originalChildIds.indexOf(position.nodeId)
      if (pos !== -1) {
        if (position.beforeOrAfter === RelativeLinearPosition.BEFORE) {
          return originalChildIds.slice(0, pos).concat(newChildIds, originalChildIds.slice(pos))
        } else {
          return originalChildIds.slice(0, pos + 1).concat(newChildIds, originalChildIds.slice(pos + 1))
        }
      } else {
        // this should really not happen
        // tslint:disable-next-line:no-console
        console.error(`Trying to put nodes at position ${position.beforeOrAfter} of a
                       node '${position.nodeId}' that does not exist`)
        // but just put them at the end (graceful degradation?)
        return originalChildIds.concat(newChildIds)
      }
    }
  }

}

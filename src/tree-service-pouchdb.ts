import {
  TreeService,
  LoadedTree,
  State,
  Status,
  Command,
  CommandBuilder,
  SplitNodeByIdCommandPayload,
  UnsplitNodeByIdCommandPayload,
  MergeNodesByIdCommandPayload,
  UnmergeNodesByIdCommandPayload,
  RenameNodeByIdCommandPayload,
  ReparentNodesByIdCommandPayload,
} from './tree-api'
import {generateUUID} from './util'
import {
  RelativeLinearPosition,
  RepositoryNode,
  ResolvedRepositoryNode,
  RelativeNodePosition,
  Repository,
  PouchDbRepository,
} from './repository'

export class PouchDbTreeService implements TreeService {
  // TODO: make this injectable as soon as this service is just a generic tree service with a configurable repo
  private readonly repo: Repository = new PouchDbRepository()

  loadTree(nodeId: string): Promise<LoadedTree> {
    return loadTree(nodeId)
      .then((tree) => {
        return Promise.resolve({ status: { state: State.LOADED }, tree })
      })
      .catch((reason) => {
        if (reason.status === 404 && nodeId === 'ROOT') {
          // When the root node was requested but could not be found, initialize the tree with a minimal structure
          return this.initializeEmptyTree().then(() => this.loadTree(nodeId))
        } else if (reason.status === 404) {
          return Promise.resolve({ status: { state: State.NOT_FOUND } })
        } else {
          return Promise.resolve({ status: { state: State.ERROR, msg: `Error loading tree: ${reason}` } })
        }
      })
  }

  exec(command: Command): Promise<any> {
    if (command.payload instanceof SplitNodeByIdCommandPayload) {
      return splitNodeById(command.payload)
    } else if (command.payload instanceof UnsplitNodeByIdCommandPayload) {
      return _unsplitNodeById(command.payload)
    } else if (command.payload instanceof MergeNodesByIdCommandPayload) {
      return mergeNodesById(command.payload)
    } else if (command.payload instanceof UnmergeNodesByIdCommandPayload) {
      return _unmergeNodesById(command.payload)
    } else if (command.payload instanceof RenameNodeByIdCommandPayload) {
      return renameNodeById(command.payload)
    } else if (command.payload instanceof ReparentNodesByIdCommandPayload) {
      return reparentNodesById(command.payload)
    } else {
      throw new Error(`Received an unknown command with name ${command.payload}`)
    }
  }

  private initializeEmptyTree(): Promise<void> {
    return this.repo.cdbCreateNode('ROOT', 'ROOT', null)
      .then(() => this.repo.cdbCreateNode(generateUUID(), '', null))
      .then(child => addChildToParent(child._id, 'ROOT'))
  }

}

// 1. rename the current node to the right hand side of the split
// 2. insert a new sibling BEFORE the current node containing the left hand side of the split
function splitNodeById(cmd: SplitNodeByIdCommandPayload): Promise<any> {
  return renameNode(cmd.nodeId, cmd.afterSplitNamePart)
    .then((result) => createSibling(cmd.siblingId, cmd.beforeSplitNamePart, null, cmd.nodeId, true))
}

function _unsplitNodeById(cmd: UnsplitNodeByIdCommandPayload): Promise<any> {
  return deleteNode(cmd.newNodeId)
    .then(() => renameNode(cmd.originalNodeId, cmd.originalName))
}

// 1. rename targetnode to be targetnode.name + sourcenode.name
// 2. move all children of sourcenode to targetnode (actual move, just reparent)
// 3. delete sourcenode
// 4. focus the new node at the end of its old name
//
// For undo it is assumed that a merge never happens to a target node with children
// This function will not undo the merging of the child collections (this mirrors workflowy
// maybe we want to revisit this in the future)
function mergeNodesById(cmd: MergeNodesByIdCommandPayload): Promise<any> {
  return getChildNodes(cmd.sourceNodeId, true)
    .then(children =>
      reparentNodes(children, cmd.targetNodeId, {beforeOrAfter: RelativeLinearPosition.END, nodeId: null}))
    .then(() => renameNode(cmd.targetNodeId, cmd.targetNodeName + cmd.sourceNodeName))
    .then(() => deleteNode(cmd.sourceNodeId))
}

// We need dedicated "unmerge" command because when we merge, we delete a node and if we
// want to undo that action we need to be able to "resurrect" that node so that a chain
// of undo commands has a chance of working since they may refer to that original node's Id.
function _unmergeNodesById(cmd: UnmergeNodesByIdCommandPayload): Promise<any> {
  return undeleteNode(cmd.sourceNodeId)
    .then(() => getChildNodes(cmd.targetNodeId, true))
    .then(children =>
      reparentNodes(children, cmd.sourceNodeId, {beforeOrAfter: RelativeLinearPosition.END, nodeId: null}))
    .then(() => renameNode(cmd.targetNodeId, cmd.targetNodeName))
}

function renameNodeById(cmd: RenameNodeByIdCommandPayload): Promise<any> {
  return renameNode(cmd.nodeId, cmd.newName)
}

// 1. set the node's parent Id to the new id
// 2. add the node to the new parent's children
// 3. remove the node from the old parent's children
function reparentNodesById(cmd: ReparentNodesByIdCommandPayload): Promise<any> {
  return getNode(cmd.nodeId)
    .then(node => reparentNodes([node], cmd.newParentNodeId, cmd.position))
}

// -----------------------------------------------------------------------------
// ----- Former Repository Functions that are reusable and more high level -----
// -----------------------------------------------------------------------------

function loadTree(rootId: string): Promise<ResolvedRepositoryNode> {
  return this.repo.cdbLoadNode(rootId, false).then(root => this.repo.cdbLoadTree(root))
}

// loads the node by id, renames it and then returns a Promise of a response when done
function renameNode(nodeId: string, newName: string): Promise<any> {
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
        })
      } else {
        // tslint:disable-next-line:no-console
        console.log(`not actually renaming since "${newName}" was already set`)
      }
    })
}

function createSibling(siblingId: string, name: string, content: string, existingNodeId: string,
                       before: boolean): Promise<RepositoryNode> {
  return this.repo.cdbLoadNode(existingNodeId, true)
    .then(sibling => {
      return this.repo.cdbCreateNode(siblingId, name, content)
        .then(newSibling => {
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

function getNode(nodeId: string): Promise<RepositoryNode> {
  // console.log(`getNode for id '${nodeId}'`)
  return this.repo.cdbLoadNode(nodeId, false)
}

function getChildNodes(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode[]> {
  return this.repo.cdbLoadNode(nodeId, includeDeleted).then(node => this.repo.cdbLoadChildren(node, includeDeleted))
}

// takes an array of _actual_ nodes and a new parent id, then it reparents those nodes by:
// 1. removing them from their parent childrefs
// 2. updating their parentref to their parent's ref
// 3. adding the childs to their new parents childrefs
// If an afterNodeId is provided the nodes are inserted after that child of the new parent
// TODO: this function gets used to jsut move nodes inside of the same parent as well,
// theoretically we could optimise this by distinguishing between the case where the
// new parent is new and the case where the parent is the same. Or we introduce a new
// function just for that?
function reparentNodes(children: RepositoryNode[], newParentId: string,
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
    }))
    // 2.a. Hang the children under their new parent by updating their parent refs
    .then(oldParentUpdateResult => outlineDb.bulkDocs(reparentedChildren))
    // 2.b. and by adding them to the childrefs of the new parent
    .then(bulkUpdateChildrenResult => this.repo.cdbLoadNode(newParentId, false))
    .then(newParentNode => this.repo.cdbPutNode({
      _id: newParentNode._id,
      _rev: newParentNode._rev,
      name: newParentNode.name,
      content: newParentNode.content,
      parentref: newParentNode.parentref,
      // add all the new children to the new parent
      childrefs: mergeNodeIds(newParentNode.childrefs || [], childIds, position),
      deleted: !!newParentNode.deleted,
    }))
}

function mergeNodeIds(originalChildIds: string[], newChildIds: string[], position: RelativeNodePosition): string[] {
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

// deletes a node, this just sets a deleted flag to true
function deleteNode(nodeId: string): Promise<any> {
  return this.repo.cdbLoadNode(nodeId, false)
    .then(node => {
      node.deleted = true
      return this.repo.cdbPutNode(node)
    })
}

// undeletes a node, just removing its deleted flag
function undeleteNode(nodeId: string): Promise<any> {
  return this.repo.cdbLoadNode(nodeId, true)
    .then(node => {
      delete node.deleted // removing this flag from the object since it is not required anymore
      return this.repo.cdbPutNode(node)
    })
}

// Returns a promise of the parent node
function addChildToParent(childId: string, parentId: string): Promise<void> {
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

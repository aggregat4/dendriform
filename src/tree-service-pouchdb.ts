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
import {RelativeLinearPosition} from './repository'
import * as repo from './repository'

class PouchDbTreeService implements TreeService {

  loadTree(nodeId: string): Promise<LoadedTree> {
    return repo.loadTree(nodeId)
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

  exec(command: Command): void {
    if (command.payload instanceof SplitNodeByIdCommandPayload) {
      splitNodeById(command.payload)
    } else if (command.payload instanceof UnsplitNodeByIdCommandPayload) {
      _unsplitNodeById(command.payload)
    } else if (command.payload instanceof MergeNodesByIdCommandPayload) {
      mergeNodesById(command.payload)
    } else if (command.payload instanceof UnmergeNodesByIdCommandPayload) {
      _unmergeNodesById(command.payload)
    } else if (command.payload instanceof RenameNodeByIdCommandPayload) {
      renameNodeById(command.payload)
    } else if (command.payload instanceof ReparentNodesByIdCommandPayload) {
      reparentNodesById(command.payload)
    } else {
      throw new Error(`Received an unknown command with name ${command.payload}`)
    }
  }

  private initializeEmptyTree(): Promise<void> {
    return repo.createNode('ROOT', 'ROOT', null)
      .then(() => repo.createNode(generateUUID(), '', null))
      .then(child => repo.addChildToParent(child._id, 'ROOT'))
  }

}

// 1. rename the current node to the right hand side of the split
// 2. insert a new sibling BEFORE the current node containing the left hand side of the split
function splitNodeById(cmd: SplitNodeByIdCommandPayload): Promise<Command> {
  return repo.renameNode(cmd.nodeId, cmd.afterSplitNamePart)
    .then((result) => repo.createSibling(cmd.siblingId, cmd.beforeSplitNamePart, null, cmd.nodeId, true))
    .then((newSiblingRepoNode) =>
      new CommandBuilder(
            new UnsplitNodeByIdCommandPayload(
              cmd.siblingId, cmd.nodeId, cmd.beforeSplitNamePart + cmd.afterSplitNamePart))
        .requiresRender()
        .build(),
    )
}

function _unsplitNodeById(cmd: UnsplitNodeByIdCommandPayload): Promise<void> {
  return repo.deleteNode(cmd.newNodeId)
    .then(() => repo.renameNode(cmd.originalNodeId, cmd.originalName))
}

// 1. rename targetnode to be targetnode.name + sourcenode.name
// 2. move all children of sourcenode to targetnode (actual move, just reparent)
// 3. delete sourcenode
// 4. focus the new node at the end of its old name
//
// For undo it is assumed that a merge never happens to a target node with children
// This function will not undo the merging of the child collections (this mirrors workflowy
// maybe we want to revisit this in the future)
function mergeNodesById(cmd: MergeNodesByIdCommandPayload): Promise<Command> {
  return repo.getChildNodes(cmd.sourceNodeId, true) // TODO add flag to also get deleted nodes!
    .then(children =>
      repo.reparentNodes(children, cmd.targetNodeId, {beforeOrAfter: RelativeLinearPosition.END, nodeId: null}))
    .then(() => repo.renameNode(cmd.targetNodeId, cmd.targetNodeName + cmd.sourceNodeName))
    .then(() => repo.deleteNode(cmd.sourceNodeId))
    .then(() =>
      new CommandBuilder(
        new UnmergeNodesByIdCommandPayload(cmd.sourceNodeId, cmd.targetNodeId, cmd.targetNodeName))
          .requiresRender()
          .build(),
    )
}

// We need dedicated "unmerge" command because when we merge, we delete a node and if we
// want to undo that action we need to be able to "resurrect" that node so that a chain
// of undo commands has a chance of working since they may refer to that original node's Id.
function _unmergeNodesById(cmd: UnmergeNodesByIdCommandPayload): Promise<void> {
  return repo.undeleteNode(cmd.sourceNodeId)
    .then(() => repo.getChildNodes(cmd.targetNodeId, true))
    .then(children =>
      repo.reparentNodes(children, cmd.sourceNodeId, {beforeOrAfter: RelativeLinearPosition.END, nodeId: null}))
    .then(() => repo.renameNode(cmd.targetNodeId, cmd.targetNodeName))
}

function renameNodeById(cmd: RenameNodeByIdCommandPayload): Promise<Command> {
  return repo.renameNode(cmd.nodeId, cmd.newName)
    .then(() =>
      new CommandBuilder(
        new RenameNodeByIdCommandPayload(cmd.nodeId, cmd.newName, cmd.oldName))
          .requiresRender()
          .build(),
    )
}

// 1. set the node's parent Id to the new id
// 2. add the node to the new parent's children
// 3. remove the node from the old parent's children
function reparentNodesById(cmd: ReparentNodesByIdCommandPayload): Promise<Command> {
  return repo.getNode(cmd.nodeId)
    .then(node => repo.reparentNodes([node], cmd.newParentNodeId, cmd.position))
    .then(() =>
      new CommandBuilder(
        new ReparentNodesByIdCommandPayload(
          cmd.nodeId,
          cmd.newParentNodeId,
          null,
          cmd.oldParentNodeId,
          { beforeOrAfter: RelativeLinearPosition.AFTER, nodeId: cmd.oldAfterNodeId}),
        )
          .requiresRender()
          .build(),
    )
}

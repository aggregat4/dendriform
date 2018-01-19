import * as repo from './repository'
import {ResolvedRepositoryNode, RelativeNodePosition, RelativeLinearPosition} from './repository'
// Re-exporting the RepositoryNode types because they need to be used by consumers of this API
export {RepositoryNode, ResolvedRepositoryNode, RelativeLinearPosition, RelativeNodePosition} from './repository'

export enum State {
  LOADING,
  LOADED,
  ERROR,
}

export interface Status {
  state: State
  msg: string
}

export interface Store {
  status: Status
  tree: ResolvedRepositoryNode
}

const STORE: Store = {
  status: {
    state: State.LOADING,
    msg: null,
  } as Status,
  tree: null,
}

export function getStore(): Store {
  return STORE
}

export interface TreeService {
  loadTree: (nodeId: string) => Promise<Status>,
  initializeEmptyTree: () => Promise<void>,
  getStore: () => Store,
}

// TODO: move to pouchdb impl
export function loadTree(nodeId: string): Promise<Status> {
  return repo.loadTree(nodeId)
    .then((tree) => {
      STORE.tree = tree
      STORE.status.state = State.LOADED
      return Promise.resolve(STORE.status)
    })
    .catch((reason) => {
      if (reason.status === 404 && nodeId === 'ROOT') {
        // When the root node was requested but could not be found, initialize the tree with a minimal structure
        return initializeEmptyTree().then(() => loadTree(nodeId))
      } else if (reason.status === 404) {
        // In case we are called with a non existent ID and it is not root, just load the root node
        // TODO should we rather handle this in the UI and redirect to the root node?
        return loadTree('ROOT')
      } else {
        STORE.tree = null
        STORE.status.state = State.ERROR
        STORE.status.msg = `Error loading tree: ${reason}`
        return Promise.resolve(STORE.status)
      }
    })
}

// TODO: move to pouchdb impl
export function initializeEmptyTree(): Promise<void> {
  return repo.createNode('ROOT', 'ROOT', null)
    .then(() => repo.createNode(null, '', null))
    .then(child => repo.addChildToParent(child._id, 'ROOT'))
}

const UNDO_BUFFER: Array<Promise<Command>> = []
const REDO_BUFFER: Array<Promise<Command>> = []

export function popLastUndoCommand(): Promise<Command> {
  return UNDO_BUFFER.pop()
}

interface CommandPayload {
  name: string,
}

export class Command {
  constructor(
    readonly payload: CommandPayload,
    readonly renderRequired: boolean = false,
    readonly beforeFocusNodeId: string = null,
    readonly beforeFocusPos: number = -1,
    public afterFocusNodeId: string = null,
    public afterFocusPos: number = -1,
    readonly undoable: boolean = false,
  ) {}
}

export class CommandResult {
  constructor(
    readonly focusNodeId: string = null,
    readonly focusPos: number = -1,
    readonly renderRequired: boolean = false,
  ) {}
}

export class CommandBuilder {
  private payload: CommandPayload
  private renderRequired: boolean = false
  private beforeFocusNodeId: string = null
  private beforeFocusPos: number = -1
  private afterFocusNodeId: string = null
  private afterFocusPos: number = -1
  private undoable: boolean = false

  constructor(payload: CommandPayload) {
    this.payload = payload
  }

  requiresRender(): CommandBuilder {
    this.renderRequired = true
    return this
  }

  withBeforeFocusNodeId(beforeFocusNodeId: string): CommandBuilder {
    this.beforeFocusNodeId = beforeFocusNodeId
    return this
  }

  withBeforeFocusPos(beforeFocusPos: number): CommandBuilder {
    this.beforeFocusPos = beforeFocusPos
    return this
  }

  withAfterFocusNodeId(afterFocusNodeId: string): CommandBuilder {
    this.afterFocusNodeId = afterFocusNodeId
    return this
  }

  withAfterFocusPos(afterFocusPos: number): CommandBuilder {
    this.afterFocusPos = afterFocusPos
    return this
  }

  isUndoable(): CommandBuilder {
    this.undoable = true
    return this
  }

  build(): Command {
    return new Command(
      this.payload,
      this.renderRequired,
      this.beforeFocusNodeId,
      this.beforeFocusPos,
      this.afterFocusNodeId,
      this.afterFocusPos,
      this.undoable,
    )
  }
}

export class SplitNodeByIdCommandPayload implements CommandPayload {
  readonly name = 'splitNodeById'
  // uses parameter properties to have a sort of data class
  constructor(
    readonly nodeId: string,
    readonly beforeSplitNamePart: string,
    readonly afterSplitNamePart: string,
  ) {}
}

// Private use only, for undo
class UnsplitNodeByIdCommandPayload implements CommandPayload {
  readonly name = 'unsplitNodeById'
  constructor(
    readonly newNodeId: string,
    readonly originalNodeId: string,
    readonly originalName: string,
  ) {}
}

export class MergeNodesByIdCommandPayload implements CommandPayload {
  readonly name = 'mergeNodesById'
  constructor(
    readonly sourceNodeId: string,
    readonly sourceNodeName: string,
    readonly targetNodeId: string,
    readonly targetNodeName: string,
  ) {}
}

// Private use only, for undo
class UnmergeNodesByIdCommandPayload implements CommandPayload {
  readonly name = 'unmergeNodesById'
  constructor(
    readonly sourceNodeId: string,
    readonly targetNodeId: string,
    readonly targetNodeName: string,
  ) {}
}

export class RenameNodeByIdCommandPayload implements CommandPayload {
  readonly name = 'renameNodeById'
  constructor(
    readonly nodeId: string,
    readonly oldName: string,
    readonly newName: string,
  ) {}
}

export class ReparentNodesByIdCommandPayload implements CommandPayload {
  readonly name = 'reparentNodesById'
  constructor(
    readonly nodeId: string,
    readonly oldParentNodeId: string,
    readonly oldAfterNodeId: string,
    readonly newParentNodeId: string,
    readonly position: RelativeNodePosition,
  ) {}
}

interface CommandExecutor {
  exec: (command: Command) => Promise<Command>
}

class PouchDbCommandExecutor implements CommandExecutor {
  exec(command: Command): Promise<Command> {
    if (command.payload instanceof SplitNodeByIdCommandPayload) {
      return splitNodeById(command.payload)
    } else if (command.payload instanceof UnsplitNodeByIdCommandPayload) {
      _unsplitNodeById(command.payload)
      return null
    } else if (command.payload instanceof MergeNodesByIdCommandPayload) {
      return mergeNodesById(command.payload)
    } else if (command.payload instanceof UnmergeNodesByIdCommandPayload) {
      _unmergeNodesById(command.payload)
      return null
    } else if (command.payload instanceof RenameNodeByIdCommandPayload) {
      return renameNodeById(command.payload)
    } else if (command.payload instanceof ReparentNodesByIdCommandPayload) {
      return reparentNodesById(command.payload)
    } else {
      throw new Error(`Received an unknown command with name ${command.payload}`)
    }
  }
}

const POUCHDB_EXECUTOR = new PouchDbCommandExecutor()

class StoreCommandExecutor implements CommandExecutor {
  exec(command: Command): Promise<Command> {
    if (command.payload instanceof SplitNodeByIdCommandPayload) {

    } else if (command.payload instanceof UnsplitNodeByIdCommandPayload) {
    } else if (command.payload instanceof MergeNodesByIdCommandPayload) {
    } else if (command.payload instanceof UnmergeNodesByIdCommandPayload) {
    } else if (command.payload instanceof RenameNodeByIdCommandPayload) {
    } else if (command.payload instanceof ReparentNodesByIdCommandPayload) {
    } else {
      throw new Error(`Received an unknown command with name ${command.payload}`)
    }
  }
}

const STORE_EXECUTOR = new StoreCommandExecutor()

// Current plan:
//  - have 2 executors: one for local repo, and one for pouchdb repo
//  - gather their results (basically Promises of UndoCommands) and combine them (we need to undo in both places)
//  - compose the undocommand promises with our focus handling
//  - store actual Promises of commands in the UNDO and REDO buffers.
//    This allos us to immediately return and to have consistently ordered
//    UNDO and REDO buffers AND it allows us to nevertheless do things
//    asynchronously (like if pouchdb takes a long time to complete, we will
//    then defer waiting for that to the undo command handling)
export function executeCommand(command: Command): void {
  // console.log(`executing command: ${JSON.stringify(command)}`)
  const undoCommandPromises: Array<Promise<Command>> =
    [STORE_EXECUTOR.exec(command), POUCHDB_EXECUTOR.exec(command)]
    .map(undoCommandPromise => undoCommandPromise.then((undoCommand) => {
      if (command.undoable) {
        if (command.beforeFocusNodeId) {
          undoCommand.afterFocusNodeId = command.beforeFocusNodeId
          undoCommand.afterFocusPos = command.beforeFocusPos
        }
      }
      return undoCommand
    }))
  if (command.undoable) {
    UNDO_BUFFER.push(...undoCommandPromises)
    REDO_BUFFER.push(Promise.all(undoCommandPromises).then(() => Promise.resolve(command)))
  }
}

// 1. rename the current node to the right hand side of the split
// 2. insert a new sibling BEFORE the current node containing the left hand side of the split
function splitNodeById(cmd: SplitNodeByIdCommandPayload): Promise<Command> {
  return repo.renameNode(cmd.nodeId, cmd.afterSplitNamePart)
    .then((result) => repo.createSiblingBefore(cmd.beforeSplitNamePart, null, cmd.nodeId))
    .then((newSiblingRepoNode) =>
      new CommandBuilder(
          () => _unsplitNodeById(
            new UnsplitNodeByIdCommandPayload(
              newSiblingRepoNode._id, cmd.nodeId, cmd.beforeSplitNamePart + cmd.afterSplitNamePart)))
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
      new CommandBuilder(() => _unmergeNodesById(
          new UnmergeNodesByIdCommandPayload(cmd.sourceNodeId, cmd.targetNodeId, cmd.targetNodeName)))
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
      new CommandBuilder(() => renameNodeById(
          new RenameNodeByIdCommandPayload(cmd.nodeId, cmd.newName, cmd.oldName)))
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
      new CommandBuilder(() => reparentNodesById(
          new ReparentNodesByIdCommandPayload(
            cmd.nodeId,
            cmd.newParentNodeId,
            null,
            cmd.oldParentNodeId,
            { beforeOrAfter: RelativeLinearPosition.AFTER, nodeId: cmd.oldAfterNodeId})))
        .requiresRender()
        .build(),
    )
}

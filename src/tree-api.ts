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

const UNDO_BUFFER: Command[] = []
const REDO_BUFFER: Command[] = []

export function popLastUndoCommand(): Command {
  return UNDO_BUFFER.pop()
}

interface CommandPayload {
  name: string
}

export class CommandBuilder {
  // private fn: () => Promise<Command[]>
  private payload: CommandPayload
  private renderRequired: boolean = false
  private beforeFocusNodeId: string = null
  private beforeFocusPos: number = -1
  private afterFocusNodeId: string = null
  private afterFocusPos: number = -1
  private undoable: boolean = false

  constructor(payload: any) {
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

export class Command {
  // readonly fn: () => Promise<Command[]>
  readonly payload: CommandPayload
  readonly renderRequired: boolean = false
  readonly beforeFocusNodeId: string = null
  readonly beforeFocusPos: number = -1
  afterFocusNodeId: string = null
  afterFocusPos: number = -1
  readonly undoable: boolean = false

  constructor(fn: () => Promise<Command[]>, renderRequired: boolean, beforeFocusNodeId: string,
              beforeFocusPos: number, afterFocusNodeId: string, afterFocusPos: number, undoable: boolean) {
    this.fn = fn
    this.renderRequired = renderRequired
    this.beforeFocusNodeId = beforeFocusNodeId
    this.beforeFocusPos = beforeFocusPos
    this.afterFocusNodeId = afterFocusNodeId
    this.afterFocusPos = afterFocusPos
    this.undoable = undoable
  }
}

export class CommandResult {
  readonly focusNodeId: string = null
  readonly focusPos: number = -1
  readonly renderRequired: boolean = false

  constructor(focusNodeId: string, focusPos: number, renderRequired: boolean) {
    this.focusNodeId = focusNodeId
    this.focusPos = focusPos
    this.renderRequired = renderRequired
  }
}

export function executeCommand(command: Command): Promise<CommandResult> {
  // console.log(`executing command: ${JSON.stringify(command)}`)
  return command.fn()
    .then(undoCommands => {
      if (command.undoable) {
        undoCommands.forEach(c => {
          // if a command is triggered and there was a valid focus position before the change
          // then we want to restore the focus to that position after executing the undo command
          if (command.beforeFocusNodeId) {
            // TODO: instead of relaxing accessibility on these properties: does this even make sense?
            // shouldÄ'nt we do this logic when building the UNDO commands down below? Check this.
            c.afterFocusNodeId = command.beforeFocusNodeId
            c.afterFocusPos = command.beforeFocusPos
          }
        })
        // console.log(`storing UNDO command: ${JSON.stringify(undoCommands)}`)
        UNDO_BUFFER.push(...undoCommands)
      }
    })
    .then(() => command.undoable && REDO_BUFFER.push(command))
    .then(() => Promise.resolve(
      new CommandResult(command.afterFocusNodeId, command.afterFocusPos, command.renderRequired)))
}

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

export function initializeEmptyTree(): Promise<void> {
  return repo.createNode('ROOT', 'ROOT', null)
    .then(() => repo.createNode(null, '', null))
    .then(child => repo.addChildToParent(child._id, 'ROOT'))
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

export class MergeNodesByIdCommandPayload implements CommandPayload {
  readonly name = 'mergeNodesById'
  constructor(
    readonly sourceNodeId: string,
    readonly sourceNodeName: string,
    readonly targetNodeId: string,
    readonly targetNodeName: string,
  ) {}
}

export class RenameNodesByIdCommandPayload implements CommandPayload {
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

// 1. rename the current node to the right hand side of the split
// 2. insert a new sibling BEFORE the current node containing the left hand side of the split
function splitNodeById(nodeId: string, beforeSplitNamePart: string, afterSplitNamePart: string): Promise<Command[]> {
  return repo.renameNode(nodeId, afterSplitNamePart)
    .then((result) => repo.createSiblingBefore(beforeSplitNamePart, null, nodeId))
    .then((newSiblingRepoNode) => ([
      new CommandBuilder(
          () => _unsplitNodeById(newSiblingRepoNode._id, nodeId, beforeSplitNamePart + afterSplitNamePart))
        .requiresRender()
        .build(),
    ]))
}

function _unsplitNodeById(newNodeId: string, originalNodeId: string, name: string): Promise<Command[]> {
  return repo.deleteNode(newNodeId)
    .then(() => repo.renameNode(originalNodeId, name))
    .then(() => ([])) // TODO these are not really commands, we don't need to undo these (and can't)
}

// 1. rename targetnode to be targetnode.name + sourcenode.name
// 2. move all children of sourcenode to targetnode (actual move, just reparent)
// 3. delete sourcenode
// 4. focus the new node at the end of its old name
//
// For undo it is assumed that a merge never happens to a target node with children
// This function will not undo the merging of the child collections (this mirrors workflowy
// maybe we want to revisit this in the future)
function mergeNodesById(
    sourceNodeId: string, sourceNodeName: string, targetNodeId: string, targetNodeName: string): Promise<Command[]> {
  return repo.getChildNodes(sourceNodeId, true) // TODO add flag to also get deleted nodes!
    .then(children =>
      repo.reparentNodes(children, targetNodeId, {beforeOrAfter: RelativeLinearPosition.END, nodeId: null}))
    .then(() => repo.renameNode(targetNodeId, targetNodeName + sourceNodeName))
    .then(() => repo.deleteNode(sourceNodeId))
    .then(() => ([
      new CommandBuilder(() => _unmergeNodesById(sourceNodeId, targetNodeId, targetNodeName))
        .requiresRender()
        .build(),
    ]))
}

// We need dedicated "unmerge" command because when we merge, we delete a node and if we
// want to undo that action we need to be able to "resurrect" that node so that a chain
// of undo commands has a chance of working since they may refer to that original node's Id.
function _unmergeNodesById(sourceNodeId: string, targetNodeId: string, targetNodeName: string): Promise<Command[]> {
  return repo.undeleteNode(sourceNodeId)
    .then(() => repo.getChildNodes(targetNodeId, true))
    .then(children =>
      repo.reparentNodes(children, sourceNodeId, {beforeOrAfter: RelativeLinearPosition.END, nodeId: null}))
    .then(() => repo.renameNode(targetNodeId, targetNodeName))
    .then(() => ([])) // TODO these are not really commands, we don't need to undo these (and can't)
}

function renameNodeById(nodeId: string, oldName: string, newName: string): Promise<Command[]> {
  return repo.renameNode(nodeId, newName)
    .then(() => ([
      new CommandBuilder(() => renameNodeById(nodeId, newName, oldName))
        .requiresRender()
        .build(),
    ]))
}

// 1. set the node's parent Id to the new id
// 2. add the node to the new parent's children
// 3. remove the node from the old parent's children
function reparentNodesById(
    nodeId: string,
    oldParentNodeId: string,
    oldAfterNodeId: string,
    newParentNodeId: string,
    position: RelativeNodePosition): Promise<Command[]> {
  return repo.getNode(nodeId)
    .then(node => repo.reparentNodes([node], newParentNodeId, position))
    .then(() => ([
      new CommandBuilder(() => reparentNodesById(
          nodeId,
          newParentNodeId,
          null,
          oldParentNodeId,
          { beforeOrAfter: RelativeLinearPosition.AFTER, nodeId: oldAfterNodeId}))
        .requiresRender()
        .build(),
    ]))
}

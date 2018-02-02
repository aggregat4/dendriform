import {ResolvedRepositoryNode, RelativeNodePosition, RelativeLinearPosition} from './repository'
// Re-exporting the RepositoryNode types because they need to be used by consumers of this API
export {RepositoryNode, ResolvedRepositoryNode, RelativeLinearPosition, RelativeNodePosition} from './repository'

export enum State {
  LOADING,
  LOADED,
  ERROR,
  NOT_FOUND,
}

export interface Status {
  state: State
  msg?: string
}

export interface LoadedTree {
  status: Status
  tree?: ResolvedRepositoryNode
}

export interface TreeService {
  loadTree: (nodeId: string) => Promise<LoadedTree>,
  exec: (command: Command) => void,
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
    readonly siblingId: string,
    readonly nodeId: string,
    readonly beforeSplitNamePart: string,
    readonly afterSplitNamePart: string,
  ) {}
}

// Private use only, for undo
export class UnsplitNodeByIdCommandPayload implements CommandPayload {
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
export class UnmergeNodesByIdCommandPayload implements CommandPayload {
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

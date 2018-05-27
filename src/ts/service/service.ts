import {
  ResolvedRepositoryNode,
  RelativeNodePosition,
  RelativeLinearPosition,
  LoadedTree,
  MergeNameOrder,
} from '../domain/domain'

export interface Filter {
  query: string
}

export interface Highlight {
  pos: number,
  length: number
}

export interface TreeService {
  loadTree(nodeId: string): Promise<LoadedTree>,
  exec(command: Command): Promise<any>,
}

interface CommandPayload {
  name: string,
  inverse(): CommandPayload,
}

export class Command {
  constructor(
    readonly payload: CommandPayload,
    readonly renderRequired: boolean = false,
    public beforeFocusNodeId: string = null,
    public beforeFocusPos: number = -1,
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
    readonly newNodeName: string,
    readonly remainingNodeName: string,
    readonly mergeNameOrder: MergeNameOrder,
  ) {}

  inverse() {
    return new MergeNodesByIdCommandPayload(
      this.siblingId,
      this.newNodeName,
      this.nodeId,
      this.remainingNodeName,
      this.mergeNameOrder,
    )
  }
}

export class MergeNodesByIdCommandPayload implements CommandPayload {
  readonly name = 'mergeNodesById'

  constructor(
    readonly sourceNodeId: string,
    readonly sourceNodeName: string,
    readonly targetNodeId: string,
    readonly targetNodeName: string,
    readonly mergeNameOrder: MergeNameOrder,
  ) {}

  inverse(): CommandPayload {
    return new SplitNodeByIdCommandPayload(
      this.sourceNodeId,
      this.targetNodeId,
      this.sourceNodeName,
      this.targetNodeName,
      this.mergeNameOrder,
    )
  }
}

export class RenameNodeByIdCommandPayload implements CommandPayload {
  readonly name = 'renameNodeById'

  constructor(
    readonly nodeId: string,
    readonly oldName: string,
    readonly newName: string,
  ) {}

  inverse() {
    return new RenameNodeByIdCommandPayload(this.nodeId, this.newName, this.oldName)
  }
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

  inverse() {
    return new ReparentNodesByIdCommandPayload(
      this.nodeId,
      this.newParentNodeId,
      null,
      this.oldParentNodeId,
      { beforeOrAfter: RelativeLinearPosition.AFTER, nodeId: this.oldAfterNodeId},
    )
  }

}

export class OpenNodeByIdCommandPayload implements CommandPayload {
  readonly name = 'openNodeById'

  constructor(readonly nodeId: string) {}

  inverse() {
    return new CloseNodeByIdCommandPayload(this.nodeId)
  }
}

export class CloseNodeByIdCommandPayload implements CommandPayload {
  readonly name = 'closeNodeById'

  constructor(readonly nodeId: string) {}

  inverse() {
    return new OpenNodeByIdCommandPayload(this.nodeId)
  }
}

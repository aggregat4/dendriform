import {
  ResolvedRepositoryNode,
  RelativeNodePosition,
  RelativeLinearPosition,
  LoadedTree,
  MergeNameOrder,
} from '../domain/domain'

export interface CommandHandler {
  exec(command: Command): Promise<any>
}

interface CommandPayload {
  inverse(): CommandPayload,
  requiresRender(): boolean
}

export class Command {
  constructor(
    readonly payload: CommandPayload,
    public beforeFocusNodeId: string = null,
    public beforeFocusPos: number = -1,
    public afterFocusNodeId: string = null,
    public afterFocusPos: number = -1,
    readonly undoable: boolean = false,
  ) {}
}

export class CommandBuilder {
  private payload: CommandPayload
  private beforeFocusNodeId: string = null
  private beforeFocusPos: number = -1
  private afterFocusNodeId: string = null
  private afterFocusPos: number = -1
  private undoable: boolean = false

  constructor(payload: CommandPayload) {
    this.payload = payload
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
      this.beforeFocusNodeId,
      this.beforeFocusPos,
      this.afterFocusNodeId,
      this.afterFocusPos,
      this.undoable,
    )
  }
}

export class SplitNodeByIdCommandPayload implements CommandPayload {
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

  requiresRender() { return false }
}

export class MergeNodesByIdCommandPayload implements CommandPayload {
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

  requiresRender() { return false }
}

export class RenameNodeByIdCommandPayload implements CommandPayload {
  constructor(
    readonly nodeId: string,
    readonly oldName: string,
    readonly newName: string,
  ) {}

  inverse() {
    return new RenameNodeByIdCommandPayload(this.nodeId, this.newName, this.oldName)
  }

  requiresRender() { return false }
}

export class ReparentNodesByIdCommandPayload implements CommandPayload {
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

  requiresRender() { return false }
}

export class OpenNodeByIdCommandPayload implements CommandPayload {
  constructor(readonly nodeId: string) {}

  inverse() {
    return new CloseNodeByIdCommandPayload(this.nodeId)
  }

  requiresRender() { return false }
}

export class CloseNodeByIdCommandPayload implements CommandPayload {
  constructor(readonly nodeId: string) {}

  inverse() {
    return new OpenNodeByIdCommandPayload(this.nodeId)
  }

  requiresRender() { return false }
}

export class DeleteNodeByIdCommandPayload implements CommandPayload {
  constructor(readonly nodeId: string) {}

  inverse() {
    return new UndeleteNodeByIdCommandPayload(this.nodeId)
  }

  requiresRender() { return false }
}

export class UndeleteNodeByIdCommandPayload implements CommandPayload {
  constructor(readonly nodeId: string) {}

  inverse() {
    return new DeleteNodeByIdCommandPayload(this.nodeId)
  }

  requiresRender() { return true }
}

export class UpdateNoteByIdCommandPayload implements CommandPayload {
  constructor(
    readonly nodeId: string,
    readonly oldNote: string,
    readonly newNote: string,
  ) {}

  inverse() {
    return new UpdateNoteByIdCommandPayload(this.nodeId, this.newNote, this.oldNote)
  }

  requiresRender() { return false }
}

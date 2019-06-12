import {RelativeNodePosition, RelativeLinearPosition} from '../domain/domain'
import { MergeNameOrder } from '../service/service'

export interface CommandHandler {
  exec(command: Command): Promise<any>
}

// TODO: make this an abstract class, the other payloads can inherit and save a ton of code
export interface CommandPayload {
  inverse(): CommandPayload,
  requiresRender(): boolean
  // idea: add notion of batch vs interactive, in batch case rerender is debounced?
}

// TODO: consider whether it is worth using a discriminated union type instead of
// subtypes for the CommandPayload, it would theoretically allow for exhaustiveness
// checks when switching on it. Probably not worth the effort though.
export class Command {
  constructor(
    readonly payload: CommandPayload,
    public beforeFocusNodeId: string = null,
    public beforeFocusPos: number = -1,
    public afterFocusNodeId: string = null,
    public afterFocusPos: number = -1,
    readonly undoable: boolean = false,
    readonly batch: boolean = false,
    readonly synchronous: boolean = false,
  ) {}
}

export class CommandBuilder {
  private payload: CommandPayload
  private beforeFocusNodeId: string = null
  private beforeFocusPos: number = -1
  private afterFocusNodeId: string = null
  private afterFocusPos: number = -1
  private undoable: boolean = false
  // TODO: verify whether we still need this
  private batch: boolean = false
  private synchronous: boolean = false

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

  isBatch(): CommandBuilder {
    this.batch = true
    return this
  }

  isSynchronous(): CommandBuilder {
    this.synchronous = true
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
      this.batch,
      this.synchronous,
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

export class ReparentNodeByIdCommandPayload implements CommandPayload {
  constructor(
    readonly nodeId: string,
    readonly oldParentNodeId: string,
    readonly oldAfterNodeId: string,
    readonly newParentNodeId: string,
    readonly position: RelativeNodePosition,
  ) {}

  inverse() {
    return new ReparentNodeByIdCommandPayload(
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

  // TODO: figure out why this is the only command that requires a rerender!?
  requiresRender() { return true }
}

export class CompleteNodeByIdCommandPayload implements CommandPayload {
  constructor(readonly nodeId: string) {}

  inverse() {
    return new UnCompleteNodeByIdCommandPayload(this.nodeId)
  }

  // In case the tree is set to not show completed nodes, we need a rerender since
  // we need to make sure nodes are removed from the tree afterwards for navigation to work
  // TODO: we only need rerender if a certain setting is set. Should these maybe be properties of the builder?
  requiresRender() { return true }
}

export class UnCompleteNodeByIdCommandPayload implements CommandPayload {
  constructor(readonly nodeId: string) {}

  inverse() {
    return new CompleteNodeByIdCommandPayload(this.nodeId)
  }

  requiresRender() { return true } // we don't need a rerender since we can only uncomplete when the node is visible
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

export class CreateChildNodeCommandPayload implements CommandPayload {
  constructor(
    readonly nodeId: string,
    readonly name: string,
    readonly note: string,
    readonly parentId: string,
  ) {}

  inverse() {
    return new DeleteNodeByIdCommandPayload(this.nodeId)
  }

  requiresRender() { return false }
}

import { RelativeNodePosition, RelativeLinearPosition } from '../domain/domain'
import { MergeNameOrder } from '../service/service'

export interface CommandHandler {
  exec(command: Command): Promise<void>
}

interface CommandPayload {
  inverse(): CommandPayload
  requiresRender(): boolean
  // idea: add notion of batch vs interactive, in batch case rerender is debounced?
}

export class Command {
  constructor(
    readonly payload: CommandPayload,
    public beforeFocusNodeId: string = null,
    public beforeFocusPos: number = -1,
    public afterFocusNodeId: string = null,
    public afterFocusPos: number = -1,
    readonly undoable: boolean = false,
    readonly batch: boolean = false,
    readonly _synchronous: boolean = false
  ) {}

  // Whether or not a command should synchronously executed is implicitly true when it requires
  // a rerender (because of timing between store and load) or when the user has explicitly requested
  // it
  get synchronous(): boolean {
    return this.payload.requiresRender() || this._synchronous
  }
}

export class CommandBuilder {
  private payload: CommandPayload
  private beforeFocusNodeId: string = null
  private beforeFocusPos = -1
  private afterFocusNodeId: string = null
  private afterFocusPos = -1
  private undoable = false
  // TODO: verify whether we still need this
  private batch = false
  private synchronous = false

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
      this.synchronous
    )
  }
}

export class SplitNodeByIdCommandPayload implements CommandPayload {
  // uses parameter properties to have a sort of data class
  constructor(
    readonly siblingId: string,
    readonly siblingParentId: string,
    readonly nodeId: string,
    readonly nodeParentId: string,
    readonly newNodeName: string,
    readonly remainingNodeName: string,
    readonly mergeNameOrder: MergeNameOrder
  ) {}

  inverse(): CommandPayload {
    return new MergeNodesByIdCommandPayload(
      this.siblingId,
      this.siblingParentId,
      this.newNodeName,
      this.nodeId,
      this.nodeParentId,
      this.remainingNodeName,
      this.mergeNameOrder
    )
  }

  requiresRender(): boolean {
    return false
  }
}

export class MergeNodesByIdCommandPayload implements CommandPayload {
  constructor(
    readonly sourceNodeId: string,
    readonly sourceNodeName: string,
    readonly sourceParentId: string,
    readonly targetNodeId: string,
    readonly targetNodeName: string,
    readonly targetParentId: string,
    readonly mergeNameOrder: MergeNameOrder
  ) {}

  inverse(): CommandPayload {
    return new SplitNodeByIdCommandPayload(
      this.sourceNodeId,
      this.sourceParentId,
      this.targetNodeId,
      this.targetParentId,
      this.sourceNodeName,
      this.targetNodeName,
      this.mergeNameOrder
    )
  }

  requiresRender(): boolean {
    return false
  }
}

export class RenameNodeByIdCommandPayload implements CommandPayload {
  constructor(
    readonly nodeId: string,
    readonly parentId: string,
    readonly oldName: string,
    readonly newName: string
  ) {}

  inverse(): CommandPayload {
    return new RenameNodeByIdCommandPayload(this.nodeId, this.parentId, this.newName, this.oldName)
  }

  requiresRender(): boolean {
    return false
  }
}

export class ReparentNodeByIdCommandPayload implements CommandPayload {
  constructor(
    readonly nodeId: string,
    readonly oldParentNodeId: string,
    readonly oldAfterNodeId: string,
    readonly newParentNodeId: string,
    readonly position: RelativeNodePosition
  ) {}

  inverse(): CommandPayload {
    return new ReparentNodeByIdCommandPayload(
      this.nodeId,
      this.newParentNodeId,
      null,
      this.oldParentNodeId,
      {
        beforeOrAfter: RelativeLinearPosition.AFTER,
        nodeId: this.oldAfterNodeId,
      }
    )
  }

  requiresRender(): boolean {
    return false
  }
}

export class OpenNodeByIdCommandPayload implements CommandPayload {
  constructor(readonly nodeId: string, readonly parentId: string) {}

  inverse(): CommandPayload {
    return new CloseNodeByIdCommandPayload(this.nodeId, this.parentId)
  }

  requiresRender(): boolean {
    return false
  }
}

export class CloseNodeByIdCommandPayload implements CommandPayload {
  constructor(readonly nodeId: string, readonly parentId: string) {}

  inverse(): CommandPayload {
    return new OpenNodeByIdCommandPayload(this.nodeId, this.parentId)
  }

  requiresRender(): boolean {
    return false
  }
}

export class DeleteNodeByIdCommandPayload implements CommandPayload {
  constructor(readonly nodeId: string, readonly parentId: string) {}

  inverse(): CommandPayload {
    return new UndeleteNodeByIdCommandPayload(this.nodeId, this.parentId)
  }

  requiresRender(): boolean {
    return false
  }
}

export class UndeleteNodeByIdCommandPayload implements CommandPayload {
  constructor(readonly nodeId: string, readonly parentId: string) {}

  inverse(): CommandPayload {
    return new DeleteNodeByIdCommandPayload(this.nodeId, this.parentId)
  }

  // we need the node to reappear in the tree: therefore we trigger a rerender and it will get loaded
  requiresRender(): boolean {
    return true
  }
}

export class CompleteNodeByIdCommandPayload implements CommandPayload {
  constructor(readonly nodeId: string, readonly parentId: string) {}

  inverse(): CommandPayload {
    return new UnCompleteNodeByIdCommandPayload(this.nodeId, this.parentId)
  }

  // In case the tree is set to not show completed nodes, we need a rerender since
  // we need to make sure nodes are removed from the tree afterwards for navigation to work
  requiresRender(): boolean {
    return true
  }
}

export class UnCompleteNodeByIdCommandPayload implements CommandPayload {
  constructor(readonly nodeId: string, readonly parentId: string) {}

  inverse(): CommandPayload {
    return new CompleteNodeByIdCommandPayload(this.nodeId, this.parentId)
  }

  // Changes the tree structure: undo can cause an uncomplete of a node that needs to reappear (see undelete)
  // this requires loading the nodes and rendering them
  requiresRender(): boolean {
    return true
  }
}

export class UpdateNoteByIdCommandPayload implements CommandPayload {
  constructor(
    readonly nodeId: string,
    readonly parentId: string,
    readonly oldNote: string,
    readonly newNote: string
  ) {}

  inverse(): CommandPayload {
    return new UpdateNoteByIdCommandPayload(this.nodeId, this.parentId, this.newNote, this.oldNote)
  }

  requiresRender(): boolean {
    return false
  }
}

export class CreateChildNodeCommandPayload implements CommandPayload {
  constructor(
    readonly nodeId: string,
    readonly name: string,
    readonly note: string,
    readonly parentId: string
  ) {}

  inverse(): CommandPayload {
    return new DeleteNodeByIdCommandPayload(this.nodeId, this.parentId)
  }

  requiresRender(): boolean {
    return false
  }
}

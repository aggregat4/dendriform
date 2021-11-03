import {
  Command,
  CommandHandler,
  SplitNodeByIdCommandPayload,
  MergeNodesByIdCommandPayload,
  RenameNodeByIdCommandPayload,
  ReparentNodeByIdCommandPayload,
  OpenNodeByIdCommandPayload,
  CloseNodeByIdCommandPayload,
  UndeleteNodeByIdCommandPayload,
  DeleteNodeByIdCommandPayload,
  UpdateNoteByIdCommandPayload,
  CreateChildNodeCommandPayload,
  CompleteNodeByIdCommandPayload,
  UnCompleteNodeByIdCommandPayload,
} from './commands'
import { TreeService } from '../service/tree-service'

export class TreeServiceCommandHandler implements CommandHandler {
  constructor(readonly treeService: TreeService) {}

  exec(command: Command): Promise<void> {
    this.toAction(command)()
    return
  }

  private toAction(command: Command): () => void {
    const payload = command.payload
    if (payload instanceof SplitNodeByIdCommandPayload) {
      return () =>
        this.treeService.splitNode(
          payload.nodeId,
          payload.nodeParentId,
          payload.remainingNodeName,
          payload.siblingId,
          payload.newNodeName,
          command.synchronous
        )
    } else if (payload instanceof MergeNodesByIdCommandPayload) {
      return () =>
        this.treeService.mergeNodes(
          payload.sourceNodeId,
          payload.sourceNodeName,
          payload.sourceParentId,
          payload.targetNodeId,
          payload.targetNodeName,
          payload.targetParentId,
          payload.mergeNameOrder,
          command.synchronous
        )
    } else if (payload instanceof RenameNodeByIdCommandPayload) {
      return () =>
        this.treeService.renameNode(
          payload.nodeId,
          payload.parentId,
          payload.newName,
          command.synchronous
        )
    } else if (payload instanceof ReparentNodeByIdCommandPayload) {
      return () =>
        this.treeService.reparentNode(
          payload.nodeId,
          payload.newParentNodeId,
          payload.position,
          command.synchronous
        )
    } else if (payload instanceof OpenNodeByIdCommandPayload) {
      return () => this.treeService.openNode(payload.nodeId, payload.parentId, command.synchronous)
    } else if (payload instanceof CloseNodeByIdCommandPayload) {
      return () => this.treeService.closeNode(payload.nodeId, payload.parentId, command.synchronous)
    } else if (payload instanceof DeleteNodeByIdCommandPayload) {
      return () =>
        this.treeService.deleteNode(payload.nodeId, payload.parentId, command.synchronous)
    } else if (payload instanceof UndeleteNodeByIdCommandPayload) {
      return () =>
        this.treeService.undeleteNode(payload.nodeId, payload.parentId, command.synchronous)
    } else if (payload instanceof CompleteNodeByIdCommandPayload) {
      return () =>
        this.treeService.completeNode(payload.nodeId, payload.parentId, command.synchronous)
    } else if (payload instanceof UnCompleteNodeByIdCommandPayload) {
      return () =>
        this.treeService.unCompleteNode(payload.nodeId, payload.parentId, command.synchronous)
    } else if (payload instanceof UpdateNoteByIdCommandPayload) {
      return () =>
        this.treeService.updateNote(
          payload.nodeId,
          payload.parentId,
          payload.newNote,
          command.synchronous
        )
    } else if (payload instanceof CreateChildNodeCommandPayload) {
      return () =>
        this.treeService.createChildNode(
          payload.nodeId,
          payload.name,
          payload.note,
          payload.parentId,
          command.synchronous
        )
    } else {
      throw new Error(`Received an unknown command with name`)
    }
  }
}

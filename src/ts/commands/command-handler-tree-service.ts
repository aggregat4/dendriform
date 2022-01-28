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

  async exec(command: Command): Promise<void> {
    await this.performAction(command)
  }

  private async performAction(command: Command) {
    const payload = command.payload
    if (payload instanceof SplitNodeByIdCommandPayload) {
      await this.treeService.splitNode(
        payload.nodeId,
        payload.nodeParentId,
        payload.remainingNodeName,
        payload.siblingId,
        payload.newNodeName,
        command.synchronous
      )
    } else if (payload instanceof MergeNodesByIdCommandPayload) {
      await this.treeService.mergeNodes(
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
      await this.treeService.renameNode(
        payload.nodeId,
        payload.parentId,
        payload.newName,
        command.synchronous
      )
    } else if (payload instanceof ReparentNodeByIdCommandPayload) {
      await this.treeService.reparentNode(
        payload.nodeId,
        payload.newParentNodeId,
        payload.position,
        command.synchronous
      )
    } else if (payload instanceof OpenNodeByIdCommandPayload) {
      await this.treeService.openNode(payload.nodeId, payload.parentId, command.synchronous)
    } else if (payload instanceof CloseNodeByIdCommandPayload) {
      await this.treeService.closeNode(payload.nodeId, payload.parentId, command.synchronous)
    } else if (payload instanceof DeleteNodeByIdCommandPayload) {
      await this.treeService.deleteNode(payload.nodeId, payload.parentId, command.synchronous)
    } else if (payload instanceof UndeleteNodeByIdCommandPayload) {
      await this.treeService.undeleteNode(payload.nodeId, payload.parentId, command.synchronous)
    } else if (payload instanceof CompleteNodeByIdCommandPayload) {
      await this.treeService.completeNode(payload.nodeId, payload.parentId, command.synchronous)
    } else if (payload instanceof UnCompleteNodeByIdCommandPayload) {
      await this.treeService.unCompleteNode(payload.nodeId, payload.parentId, command.synchronous)
    } else if (payload instanceof UpdateNoteByIdCommandPayload) {
      await this.treeService.updateNote(
        payload.nodeId,
        payload.parentId,
        payload.newNote,
        command.synchronous
      )
    } else if (payload instanceof CreateChildNodeCommandPayload) {
      await this.treeService.createChildNode(
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

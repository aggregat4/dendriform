import PQueue from 'p-queue'
import {
  Command,
  CommandPayload,
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
} from './commands'
import {TreeService} from '../service/tree-service'

export class TreeServiceCommandHandler implements CommandHandler {
  // We are using a single threaded queue to serialize all updates to the repository,
  // this avoids concurrent updates that may overwhelm the persistent implementation
  // and it avoids correctness problems by out of order updates
  private queue = new PQueue({concurrency: 1})

  constructor(readonly treeService: TreeService) {}

  exec(command: Command): Promise<any> {
    const cmd = command.payload
    return this.queue.add(this.toAction(cmd))
  }

  private toAction(cmd: CommandPayload): () => void {
    if (cmd instanceof SplitNodeByIdCommandPayload) {
      return () => this.treeService.splitNode(cmd.nodeId, cmd.remainingNodeName, cmd.siblingId, cmd.newNodeName)
    } else if (cmd instanceof MergeNodesByIdCommandPayload) {
      return () => this.treeService.mergeNodes(cmd.sourceNodeId, cmd.sourceNodeName,
        cmd.targetNodeId, cmd.targetNodeName, cmd.mergeNameOrder)
    } else if (cmd instanceof RenameNodeByIdCommandPayload) {
      return () => this.treeService.renameNode(cmd.nodeId, cmd.newName)
    } else if (cmd instanceof ReparentNodeByIdCommandPayload) {
      return () => this.treeService.reparentNode(cmd.nodeId, cmd.newParentNodeId, cmd.position)
    } else if (cmd instanceof OpenNodeByIdCommandPayload) {
      return () => this.treeService.openNode(cmd.nodeId)
    } else if (cmd instanceof CloseNodeByIdCommandPayload) {
      return () => this.treeService.closeNode(cmd.nodeId)
    } else if (cmd instanceof DeleteNodeByIdCommandPayload) {
      return () => this.treeService.deleteNode(cmd.nodeId)
    } else if (cmd instanceof UndeleteNodeByIdCommandPayload) {
      return () => this.treeService.undeleteNode(cmd.nodeId)
    } else if (cmd instanceof UpdateNoteByIdCommandPayload) {
      return () => this.treeService.updateNote(cmd.nodeId, cmd.newNote)
    } else if (cmd instanceof CreateChildNodeCommandPayload) {
      return () => this.treeService.createChildNode(cmd.nodeId, cmd.name, cmd.note, cmd.parentId)
    } else {
      throw new Error(`Received an unknown command with name ${cmd}`)
    }
  }

}

import PQueue from 'p-queue'
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
} from './service'
import {TreeService} from './tree-service'

// TODO: evaluate if it does not make sense to fold the actual implementations of the methods here
// directly into the TreeService
export class TreeServiceCommandHandler implements CommandHandler {
  // We are using a single threaded queue to serialize all updates to the repository,
  // this avoids concurrent updates that may overwhelm the persistent implementation
  // and it avoids correctness problems by out of order updates
  private queue = new PQueue({concurrency: 1})

  constructor(readonly treeService: TreeService) {}

  exec(command: Command): Promise<any> {
    const cmd = command.payload
    if (cmd instanceof SplitNodeByIdCommandPayload) {
      return this.queue.add(() =>
        this.treeService.splitNode(cmd.nodeId, cmd.remainingNodeName, cmd.siblingId, cmd.newNodeName))
    } else if (cmd instanceof MergeNodesByIdCommandPayload) {
      return this.queue.add(() => this.treeService.mergeNodes(cmd.sourceNodeId, cmd.sourceNodeName,
        cmd.targetNodeId, cmd.targetNodeName, cmd.mergeNameOrder))
    } else if (cmd instanceof RenameNodeByIdCommandPayload) {
      return this.queue.add(() => this.treeService.renameNode(cmd.nodeId, cmd.newName))
    } else if (cmd instanceof ReparentNodeByIdCommandPayload) {
      return this.queue.add(() => this.treeService.reparentNode(cmd.nodeId, cmd.newParentNodeId, cmd.position))
    } else if (cmd instanceof OpenNodeByIdCommandPayload) {
      return this.queue.add(() => this.treeService.openNode(cmd.nodeId))
    } else if (cmd instanceof CloseNodeByIdCommandPayload) {
      return this.queue.add(() => this.treeService.closeNode(cmd.nodeId))
    } else if (cmd instanceof DeleteNodeByIdCommandPayload) {
      return this.queue.add(() => this.treeService.deleteNode(cmd.nodeId))
    } else if (cmd instanceof UndeleteNodeByIdCommandPayload) {
      return this.queue.add(() => this.treeService.undeleteNode(cmd.nodeId))
    } else if (cmd instanceof UpdateNoteByIdCommandPayload) {
      return this.queue.add(() => this.treeService.updateNote(cmd.nodeId, cmd.newNote))
    } else {
      throw new Error(`Received an unknown command with name ${command.payload}`)
    }
  }

}

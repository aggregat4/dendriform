import PQueue from 'p-queue'
import {
  RelativeLinearPosition,
  RepositoryNode,
  ResolvedRepositoryNode,
  RelativeNodePosition,
  LoadedTree,
  State,
  Status,
  MergeNameOrder,
} from '../domain/domain'
import {
  Command,
  CommandBuilder,
  SplitNodeByIdCommandPayload,
  MergeNodesByIdCommandPayload,
  RenameNodeByIdCommandPayload,
  ReparentNodesByIdCommandPayload,
  OpenNodeByIdCommandPayload,
  CloseNodeByIdCommandPayload,
  CommandHandler,
  UndeleteNodeByIdCommandPayload,
  DeleteNodeByIdCommandPayload,
} from './service'
import {TreeService} from './tree-service'

export class TreeServiceCommandHandler implements CommandHandler {
  // We are using a single threaded queue to serialize all updates to the repository,
  // this avoids concurrent updates that may overwhelm the persistent implementation
  // and it avoids correctness problems by out of order updates
  private queue = new PQueue({concurrency: 1})

  constructor(readonly treeService: TreeService) {}

  exec(command: Command): Promise<any> {
    if (command.payload instanceof SplitNodeByIdCommandPayload) {
      return this.queue.add(() => this.splitNodeById(command.payload as SplitNodeByIdCommandPayload))
    } else if (command.payload instanceof MergeNodesByIdCommandPayload) {
      return this.queue.add(() => this.mergeNodesById(command.payload as MergeNodesByIdCommandPayload))
    } else if (command.payload instanceof RenameNodeByIdCommandPayload) {
      return this.queue.add(() => this.renameNodeById(command.payload as RenameNodeByIdCommandPayload))
    } else if (command.payload instanceof ReparentNodesByIdCommandPayload) {
      return this.queue.add(() => this.reparentNodesById(command.payload as ReparentNodesByIdCommandPayload))
    } else if (command.payload instanceof OpenNodeByIdCommandPayload) {
      return this.queue.add(() => this.openNodeById(command.payload as OpenNodeByIdCommandPayload))
    } else if (command.payload instanceof CloseNodeByIdCommandPayload) {
      return this.queue.add(() => this.closeNodeById(command.payload as CloseNodeByIdCommandPayload))
    } else if (command.payload instanceof DeleteNodeByIdCommandPayload) {
      return this.queue.add(() => this.deleteNodeById(command.payload as DeleteNodeByIdCommandPayload))
    } else if (command.payload instanceof UndeleteNodeByIdCommandPayload) {
      return this.queue.add(() => this.undeleteNodeById(command.payload as UndeleteNodeByIdCommandPayload))
    } else {
      throw new Error(`Received an unknown command with name ${command.payload}`)
    }
  }

  // 1. rename the current node to the right hand side of the split
  // 2. insert a new sibling BEFORE the current node containing the left hand side of the split
  private splitNodeById(cmd: SplitNodeByIdCommandPayload): Promise<any> {
    return this.treeService.findNode(cmd.siblingId, true)
      .then(sibling => {
        if (sibling) {
          this.treeService.undeleteNode(cmd.siblingId)
        } else {
          this.treeService.createSibling(cmd.siblingId, cmd.newNodeName, null, cmd.nodeId, true)
        }
      })
      .then(() => this.treeService.getChildNodes(cmd.nodeId, true))
      .then(children =>
        this.treeService.reparentNodes(
          children, cmd.siblingId, {beforeOrAfter: RelativeLinearPosition.END, nodeId: null}))
      .then(() => this.treeService.renameNode(cmd.nodeId, cmd.remainingNodeName))
  }

  // 1. rename targetnode to be targetnode.name + sourcenode.name
  // 2. move all children of sourcenode to targetnode (actual move, just reparent)
  // 3. delete sourcenode
  // 4. focus the new node at the end of its old name
  //
  // For undo it is assumed that a merge never happens to a target node with children
  // This function will not undo the merging of the child collections (this mirrors workflowy
  // maybe we want to revisit this in the future)
  private mergeNodesById(cmd: MergeNodesByIdCommandPayload): Promise<any> {
    return this.treeService.getChildNodes(cmd.sourceNodeId, true)
      .then(children =>
        this.treeService.reparentNodes(
          children, cmd.targetNodeId, {beforeOrAfter: RelativeLinearPosition.END, nodeId: null}))
      .then(() => this.treeService.renameNode(
        cmd.targetNodeId,
        cmd.mergeNameOrder === MergeNameOrder.SOURCE_TARGET ?
          cmd.sourceNodeName + cmd.targetNodeName : cmd.targetNodeName + cmd.sourceNodeName))
      .then(() => this.treeService.deleteNode(cmd.sourceNodeId))
  }

  private renameNodeById(cmd: RenameNodeByIdCommandPayload): Promise<any> {
    return this.treeService.renameNode(cmd.nodeId, cmd.newName)
  }

  // 1. set the node's parent Id to the new id
  // 2. add the node to the new parent's children
  // 3. remove the node from the old parent's children
  private reparentNodesById(cmd: ReparentNodesByIdCommandPayload): Promise<any> {
    return this.treeService.getNode(cmd.nodeId)
      .then(node => this.treeService.reparentNodes([node], cmd.newParentNodeId, cmd.position))
  }

  private openNodeById(cmd: OpenNodeByIdCommandPayload): Promise<any> {
    return this.treeService.openNode(cmd.nodeId)
  }

  private closeNodeById(cmd: CloseNodeByIdCommandPayload): Promise<any> {
    return this.treeService.closeNode(cmd.nodeId)
  }

  private deleteNodeById(cmd: DeleteNodeByIdCommandPayload): Promise<any> {
    return this.treeService.deleteNode(cmd.nodeId)
  }

  private undeleteNodeById(cmd: DeleteNodeByIdCommandPayload): Promise<any> {
    return this.treeService.undeleteNode(cmd.nodeId)
  }

}

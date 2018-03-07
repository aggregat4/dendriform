import {
  TreeService,
  Command,
  CommandBuilder,
  SplitNodeByIdCommandPayload,
  UnsplitNodeByIdCommandPayload,
  MergeNodesByIdCommandPayload,
  UnmergeNodesByIdCommandPayload,
  RenameNodeByIdCommandPayload,
  ReparentNodesByIdCommandPayload,
} from './tree-api'
import {
  RelativeLinearPosition,
  RepositoryNode,
  ResolvedRepositoryNode,
  RelativeNodePosition,
  LoadedTree,
  State,
  Status,
} from './repository'
import {RepositoryService} from './repository-service'
import PQueue from 'p-queue'

export class RepositoryTreeService implements TreeService {
  private queue = new PQueue({concurrency: 1})
  private counter: number = 0

  constructor(readonly repoService: RepositoryService) {}

  loadTree(nodeId: string): Promise<LoadedTree> {
    return this.repoService.loadTreeByRootId(nodeId)
      .then((tree) => {
        if (tree.status.state === State.NOT_FOUND && nodeId === 'ROOT') {
          return this.repoService.initializeEmptyTree().then(() => this.repoService.loadTreeByRootId(nodeId))
        } else {
          return tree
        }
      })
  }

  initTree(node: ResolvedRepositoryNode): void {
    this.repoService.initializeTree(node)
  }

  exec(command: Command): Promise<any> {
    if (command.payload instanceof SplitNodeByIdCommandPayload) {
      return this.queue.add(() => this.splitNodeById(command.payload as SplitNodeByIdCommandPayload))
    } else if (command.payload instanceof UnsplitNodeByIdCommandPayload) {
      return this.queue.add(() => this.unsplitNodeById(command.payload as UnsplitNodeByIdCommandPayload))
    } else if (command.payload instanceof MergeNodesByIdCommandPayload) {
      return this.queue.add(() => this.mergeNodesById(command.payload as MergeNodesByIdCommandPayload))
    } else if (command.payload instanceof UnmergeNodesByIdCommandPayload) {
      return this.queue.add(() => this.unmergeNodesById(command.payload as UnmergeNodesByIdCommandPayload))
    } else if (command.payload instanceof RenameNodeByIdCommandPayload) {
      return this.queue.add(() => this.renameNodeById(command.payload as RenameNodeByIdCommandPayload))
    } else if (command.payload instanceof ReparentNodesByIdCommandPayload) {
      return this.queue.add(() => this.reparentNodesById(command.payload as ReparentNodesByIdCommandPayload))
    } else {
      throw new Error(`Received an unknown command with name ${command.payload}`)
    }
  }

  // 1. rename the current node to the right hand side of the split
  // 2. insert a new sibling BEFORE the current node containing the left hand side of the split
  private splitNodeById(cmd: SplitNodeByIdCommandPayload): Promise<any> {
    return this.repoService.renameNode(cmd.nodeId, cmd.afterSplitNamePart)
      .then((result) => this.repoService.createSibling(cmd.siblingId, cmd.beforeSplitNamePart, null, cmd.nodeId, true))
  }

  private unsplitNodeById(cmd: UnsplitNodeByIdCommandPayload): Promise<any> {
    return this.repoService.deleteNode(cmd.newNodeId)
      .then(() => this.repoService.renameNode(cmd.originalNodeId, cmd.originalName))
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
    return this.repoService.getChildNodes(cmd.sourceNodeId, true)
      .then(children =>
        this.repoService.reparentNodes(
          children, cmd.targetNodeId, {beforeOrAfter: RelativeLinearPosition.END, nodeId: null}))
      .then(() => this.repoService.renameNode(cmd.targetNodeId, cmd.targetNodeName + cmd.sourceNodeName))
      .then(() => this.repoService.deleteNode(cmd.sourceNodeId))
  }

  // We need dedicated "unmerge" command because when we merge, we delete a node and if we
  // want to undo that action we need to be able to "resurrect" that node so that a chain
  // of undo commands has a chance of working since they may refer to that original node's Id.
  private unmergeNodesById(cmd: UnmergeNodesByIdCommandPayload): Promise<any> {
    return this.repoService.undeleteNode(cmd.sourceNodeId)
      .then(() => this.repoService.getChildNodes(cmd.targetNodeId, true))
      .then(children =>
        this.repoService.reparentNodes(
          children, cmd.sourceNodeId, {beforeOrAfter: RelativeLinearPosition.END, nodeId: null}))
      .then(() => this.repoService.renameNode(cmd.targetNodeId, cmd.targetNodeName))
  }

  private renameNodeById(cmd: RenameNodeByIdCommandPayload): Promise<any> {
    return this.repoService.renameNode(cmd.nodeId, cmd.newName)
  }

  // 1. set the node's parent Id to the new id
  // 2. add the node to the new parent's children
  // 3. remove the node from the old parent's children
  private reparentNodesById(cmd: ReparentNodesByIdCommandPayload): Promise<any> {
    return this.repoService.getNode(cmd.nodeId)
      .then(node => this.repoService.reparentNodes([node], cmd.newParentNodeId, cmd.position))
  }
}

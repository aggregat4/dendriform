import {
  State,
  Status,
  LoadedTree,
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

export class CachingTreeService implements TreeService {

  private localTree: LoadedTree = null

  constructor(readonly backingTreeService: TreeService) {}

  getCachedTree(): LoadedTree {
    return this.localTree
  }

  loadTree(nodeId: string): Promise<LoadedTree> {
    return this.backingTreeService.loadTree(nodeId)
      .then(tree => {
        this.localTree = tree
        return this.localTree
      })
  }

  exec(command: Command): Promise<Command> {
    if (command.payload instanceof SplitNodeByIdCommandPayload) {

    } else if (command.payload instanceof UnsplitNodeByIdCommandPayload) {
    } else if (command.payload instanceof MergeNodesByIdCommandPayload) {
    } else if (command.payload instanceof UnmergeNodesByIdCommandPayload) {
    } else if (command.payload instanceof RenameNodeByIdCommandPayload) {
    } else if (command.payload instanceof ReparentNodesByIdCommandPayload) {
    } else {
      throw new Error(`Received an unknown command with name ${command.payload}`)
    }
  }

}

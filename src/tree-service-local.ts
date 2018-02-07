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
import { ResolvedRepositoryNode, RepositoryNode } from './repository'

export class CachingTreeService implements TreeService {
  private localTree: LoadedTree = null
  private treeIndex: Map<string, ResolvedRepositoryNode> = null

  constructor(readonly backingTreeService: TreeService) {}

  getCachedTree(): LoadedTree {
    return this.localTree
  }

  loadTree(nodeId: string): Promise<LoadedTree> {
    return this.backingTreeService.loadTree(nodeId)
      .then(tree => {
        this.localTree = tree
        this.indexTree()
        return this.localTree
      })
  }

  private indexTree() {
    this.treeIndex = new Map()
    this.indexNode(this.localTree.tree)
  }

  private indexNode(node: ResolvedRepositoryNode) {
    this.treeIndex.set(node.node._id, node)
    for (const child of node.children) {
      this.indexNode(child)
    }
  }

  exec(command: Command): Promise<any> {
    if (command.payload instanceof SplitNodeByIdCommandPayload) {
      // do the action locally (any synchronously)
      // dispatch the action to the backing treeservice, but don't chain promises?
      this.splitNodeById(command.payload)
    } else if (command.payload instanceof UnsplitNodeByIdCommandPayload) {
      this.unsplitNodeById(command.payload)
    } else if (command.payload instanceof MergeNodesByIdCommandPayload) {
      this.mergeNodesById(command.payload)
    } else if (command.payload instanceof UnmergeNodesByIdCommandPayload) {
      this.unmergeNodesById(command.payload)
    } else if (command.payload instanceof RenameNodeByIdCommandPayload) {
      this.renameNodeById(command.payload)
    } else if (command.payload instanceof ReparentNodesByIdCommandPayload) {
      this.reparentNodesById(command.payload)
    } else {
      throw new Error(`Received an unknown command with name ${command.payload}`)
    }
    return this.backingTreeService.exec(command)
  }


  // TODO: consider extracing the repositor
  private renameNode(nodeId: string, newName: string) {
    const node = this.treeIndex.get(nodeId)
    if (node == null) {
      throw new Error(`Not a valid nodeId '${nodeId}', can not rename`) // TODO: maybe too defensive?
    }
    node.node.name = newName
  }

  private createNode(id: string, name: string, content: string): RepositoryNode {
    // TODO: check in component whether we require the _rev somewhere, since we don't have that here
    return {
      _id: id,
      name,
      content,
      childrefs: [],
      parentref: null,
    }
  }

  private createSibling(siblingId: string, name: string, content: string, existingNodeId: string,
                        before: boolean) {
    // TODO: implementation  
    }

  splitNodeById(cmd: SplitNodeByIdCommandPayload): any {
    this.renameNode(cmd.nodeId, cmd.afterSplitNamePart)
  }

}

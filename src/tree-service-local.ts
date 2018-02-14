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

  private splitNodeById(cmd: SplitNodeByIdCommandPayload): void {
    this.renameNode(cmd.nodeId, cmd.afterSplitNamePart)
    this.createSibling(cmd.siblingId, cmd.beforeSplitNamePart, null, cmd.nodeId, true)
  }

  private unsplitNodeById(cmd: UnsplitNodeByIdCommandPayload): void {
    this.deleteNode(cmd.newNodeId)
    this.renameNode(cmd.originalNodeId, cmd.originalName)
  }

  // Note that this logic is the same as in tree-service-pouchdb.ts for createSibling
  // TODO: consider having a higher shared level of abstraction
  // the "only" real difference is the implementation of the basic load/put/create methods
  private createSibling(siblingId: string, name: string, content: string, existingNodeId: string,
                        before: boolean) {
    const sibling = this.loadNode(existingNodeId, true)
    const newSibling = this.createNode(siblingId, name, content)
    newSibling.parentref = sibling.parentref
    this.saveNode(newSibling)
    const siblingParent = this.loadNode(sibling._id, true)
    if (before) {
      siblingParent.childrefs.splice(siblingParent.childrefs.indexOf(existingNodeId), 0, newSibling._id)
    } else {
      siblingParent.childrefs.splice(siblingParent.childrefs.indexOf(existingNodeId) + 1, 0, newSibling._id)
    }

  }

  // TODO: consider extracting the repository api and just using different implementations (perhaps we could
  // even reuse these implementations here in both cases)
  private renameNode(nodeId: string, newName: string) {
    const node = this.treeIndex.get(nodeId)
    if (node == null) {
      throw new Error(`Not a valid nodeId '${nodeId}', can not rename`) // TODO: maybe too defensive?
    }
    node.node.name = newName
  }

  private createNode(id: string, name: string, content: string): RepositoryNode {
    // TODO: check in view component whether we require the _rev somewhere, since we don't have that here
    return {
      _id: id,
      name,
      content,
      childrefs: [],
      parentref: null,
    }
  }

  private deleteNode(nodeId: string): void {
    const node = this.loadNode(nodeId, true)
    node.deleted = true
    this.saveNode(node)
  }

  private undeleteNode(nodeId: string): void {
    const node = this.loadNode(nodeId, true)
    delete node.deleted
    this.saveNode(node)
  }

  private loadNode(nodeId: string, includeDeleted: boolean): RepositoryNode {
    const node = this.treeIndex.get(nodeId)
    if (node.node.deleted && node.node.deleted === true && !includeDeleted) {
      throw new Error(`Node with id '${nodeId}' was deleted`)
    } else {
      return node.node
    }
  }

  // only overwrites the node itself, does not update the children of the parent for example
  private saveNode(node: RepositoryNode): void {
    const originalNode = this.loadNode(node._id, true)
    if (! originalNode) {
      throw new Error(`Node with id '${node._id}' was not found`)
    }
    originalNode.name = node.name
    originalNode.content = node.content
    originalNode.childrefs = node.childrefs
    originalNode.parentref = node.parentref
    if (node.deleted) {
      originalNode.deleted = node.deleted
    } else {
      delete originalNode.deleted
    }
  }

}

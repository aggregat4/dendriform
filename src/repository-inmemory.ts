import {Repository, RepositoryNode, ResolvedRepositoryNode, LoadedTree, Status, State} from './repository'

export class InMemoryRepository implements Repository {
  private treeIndex: Map<string, ResolvedRepositoryNode> = null
  private tree: ResolvedRepositoryNode = null

  cdbInitTree(node: ResolvedRepositoryNode): Promise<void> {
    this.tree = node
    this.indexTree()
    return Promise.resolve()
  }

  cdbCreateNode(id: string, name: string, content: string): Promise<RepositoryNode> {
    // TODO: check in view component whether we require the _rev somewhere, since we don't have that here
    return Promise.resolve({
      _id: id,
      name,
      content,
      childrefs: [],
      parentref: null,
    })
  }

  cdbPutNode(node: RepositoryNode, retryCount?: number): Promise<void> {
    this.saveNode(node)
    return Promise.resolve()
  }

  cdbSaveAll(nodes: RepositoryNode[]): Promise<void> {
    nodes.forEach(node => this.saveNode(node))
    return Promise.resolve()
  }

  cdbLoadNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode> {
    const node = this.getNode(nodeId)
    if (node.node.deleted && node.node.deleted === true && !includeDeleted) {
      throw new Error(`Node with id '${nodeId}' was deleted`)
    } else {
      return Promise.resolve(node.node)
    }
  }

  cdbLoadChildren(node: RepositoryNode, includeDeleted: boolean): Promise<RepositoryNode[]> {
    const resolvedNode = this.treeIndex.get(node._id)
    if (! resolvedNode) {
      throw new Error(`Node with id '${node._id}' does not exist`)
    }
    // we have to map back to RepositoryNodes because of the API
    return Promise.resolve(resolvedNode.children.map(childNode => childNode.node))
  }

  cdbLoadTree(node: RepositoryNode): Promise<LoadedTree> {
    return Promise.resolve({status: {state: State.LOADED}, tree: this.tree})
  }

  private indexTree() {
    this.treeIndex = new Map()
    this.indexNode(this.tree)
  }

  private indexNode(node: ResolvedRepositoryNode) {
    this.treeIndex.set(node.node._id, node)
    for (const child of node.children) {
      this.indexNode(child)
    }
  }

  private getNode(nodeId: string): ResolvedRepositoryNode {
    const node = this.treeIndex.get(nodeId)
    if (! node) {
      throw new Error(`Node with id '${nodeId}' was not found`)
    }
    return node
  }

  private saveNode(node: RepositoryNode) {
    const originalNode = this.getNode(node._id)
    originalNode.node.name = node.name
    originalNode.node.content = node.content
    originalNode.node.childrefs = node.childrefs
    originalNode.node.parentref = node.parentref
    if (node.deleted) {
      originalNode.node.deleted = node.deleted
    } else {
      delete originalNode.node.deleted
    }
  }

}

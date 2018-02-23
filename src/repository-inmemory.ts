import {Repository, RepositoryNode, ResolvedRepositoryNode, LoadedTree, Status, State} from './repository'

export class InMemoryRepository implements Repository {
  private treeIndex: Map<string, RepositoryNode> = null
  // private tree: ResolvedRepositoryNode = null

  cdbInitTree(node: ResolvedRepositoryNode): Promise<void> {
    this.indexTree(node)
    return Promise.resolve()
  }

  cdbCreateNode(id: string, name: string, content: string): Promise<RepositoryNode> {
    // TODO: check in view component whether we require the _rev somewhere, since we don't have that here
    const node = {
      _id: id,
      name,
      content,
      childrefs: [],
      parentref: null,
    }
    this.treeIndex.set(node._id, node)
    return Promise.resolve(node)
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
    if (node.deleted && node.deleted === true && !includeDeleted) {
      throw new Error(`Node with id '${nodeId}' was deleted`)
    } else {
      return Promise.resolve(node)
    }
  }

  cdbLoadChildren(node: RepositoryNode, includeDeleted: boolean): Promise<RepositoryNode[]> {
    const realNode = this.treeIndex.get(node._id)
    if (! realNode) {
      throw new Error(`Node with id '${node._id}' does not exist`)
    }
    // we have to map back to RepositoryNodes because of the API
    return Promise.resolve(realNode.childrefs.map(c => this.getNode(c)))
  }

  cdbLoadTree(node: RepositoryNode): Promise<LoadedTree> {
    return Promise.resolve({status: {state: State.LOADED}, tree: this.resolveNode(node._id)})
  }

  private resolveNode(nodeId: string): ResolvedRepositoryNode {
    const node = this.getNode(nodeId)
    return {node, children: node.childrefs.map(c => this.resolveNode(c)) as ResolvedRepositoryNode[]}
  }

  private indexTree(node: ResolvedRepositoryNode) {
    this.treeIndex = new Map()
    this.indexNode(node)
  }

  private indexNode(node: ResolvedRepositoryNode) {
    this.treeIndex.set(node.node._id, node.node)
    for (const child of node.children) {
      this.indexNode(child)
    }
  }

  private getNode(nodeId: string): RepositoryNode {
    const node = this.treeIndex.get(nodeId)
    if (! node) {
      throw new Error(`Node with id '${nodeId}' was not found`)
    }
    return node
  }

  private saveNode(node: RepositoryNode) {
    const originalNode = this.getNode(node._id)
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

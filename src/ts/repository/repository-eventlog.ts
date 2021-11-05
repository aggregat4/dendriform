import { LoadedTree, Repository, RepositoryNode, ResolvedRepositoryNode, State } from './repository'
import {
  DEventLog,
  DEvent,
  NodeFlags,
  createNewDEventPayload,
  DEventPayload,
} from '../eventlog/eventlog-domain'
import { Predicate, debounce, ALWAYS_TRUE } from '../utils/util'
import { RelativeNodePosition, RELATIVE_NODE_POSITION_END } from '../domain/domain'
import { atomIdent } from '../lib/modules/logootsequence.js'
import { LogootSequenceWrapper } from './logoot-sequence-wrapper'
import { LifecycleAware, Subscription } from '../domain/lifecycle'

class NodeNotFoundError extends Error {}

class NodeChangedSubscription implements Subscription {
  constructor(
    readonly parentNode: string,
    readonly listener: (nodeId: string) => void,
    readonly cancelCallback: (subToCancel: Subscription) => void
  ) {}

  notify(nodeId: string): void {
    this.listener(nodeId)
  }

  cancel(): void {
    this.cancelCallback(this)
  }
}

/**
 * This is a repository implementation that uses an event log. It can be synchronised with a remote eventlog
 * to provide an offline capable, eventually consistent, multi-peer storage backend.
 */
export class EventlogRepository implements Repository, LifecycleAware {
  private parentChildMap: {
    [key in string]: LogootSequenceWrapper
  } = {}
  private childParentMap: { [key in string]: string } = {}
  private changeSubscriptions: NodeChangedSubscription[] = []
  private eventLogSubscription: Subscription = null

  private readonly debouncedNotifyNodeChangeSubscribers = debounce(
    this.notifyNodeChangeSubscribers.bind(this),
    5000
  )
  private readonly debouncedRebuildAndNotify = debounce(this.rebuildAndNotify.bind(this), 5000)

  // this is the limit after which we will bulk load all nodes instead of loading a tree incrementally
  private readonly MAX_NODES_TO_LOAD_INDIVIDUALLY = 500

  constructor(readonly eventLog: DEventLog) {}

  async init(): Promise<void> {
    await this.rebuildTreeStructureMaps()
    // This is not great: we rebuild the maps, then subscribe and theoretically we could get
    // a bunch of events coming in forcing us to rebuild again. But using the debounced function above
    // would mean delaying the inital map construction for too long...
    this.eventLogSubscription = this.eventLog.subscribe({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      notify: this.eventLogListener.bind(this),
      filter: (event) => event.originator !== this.eventLog.getPeerId(),
    })
  }

  async deinit(): Promise<void> {
    if (this.eventLogSubscription) {
      this.eventLogSubscription.cancel()
      this.eventLogSubscription = null
    }
  }

  /**
   * Tree structure changes that do not originate from the current peer means that
   * some other peer has made changes to the tree and we just got one or more events
   * about it. To be safe, and to avoid having to do something clever, we just trigger
   * a complete rebuild of the parent/child caches. we debounce the function so when
   * many events come in fast we don't do too much work.
   */
  private eventLogListener(events: DEvent[]): void {
    for (const event of events) {
      // in case of structural tree changes we need to rebuild the maps first, then notify,
      // otherwise we would miss new nodes being added (as they would not be in the tree structure maps)
      this.debouncedRebuildAndNotify(event.nodeId)
    }
  }

  private async rebuildAndNotify(nodeId: string): Promise<void> {
    await this.rebuildTreeStructureMaps().then(() => this.notifyNodeChangeSubscribers(nodeId))
  }

  private notifyNodeChangeSubscribers(nodeId: string): void {
    for (const sub of this.changeSubscriptions) {
      if (this.isNodeChildOf(nodeId, sub.parentNode)) {
        sub.notify(nodeId)
      }
    }
  }

  private isNodeChildOf(childNode: string, parentNode: string): boolean {
    if (childNode === parentNode) {
      return true
    }
    const actualParent = this.childParentMap[childNode]
    if (actualParent) {
      return this.isNodeChildOf(actualParent, parentNode)
    } else {
      return false
    }
  }

  /**
   * Rebuilds the tree structure maps for child->parent relationships and the ordering
   * of children. If during the insertion of a child->parent relationship we detect a
   * cycle, we omit that relationship. Since events are causally sorted this will be
   * consistent across nodes.
   */
  private async rebuildTreeStructureMaps(): Promise<void> {
    const newChildParentMap = {}
    const newParentChildMap = {}
    const reparentEvents = await this.eventLog.getAllEvents()
    reparentEvents.events.forEach((event) => {
      const nodeId = event.nodeId
      const parentId = event.parentId
      // updates to the tree structure that would cause cycles are not applied
      // since these are in causal order this will be consistent across clients
      if (!EventlogRepository.causesCycle(newChildParentMap, nodeId, parentId)) {
        newChildParentMap[nodeId] = parentId
        // TODO: this also needs to be refactored: we are no longer able to only have the "last" reparent event
        // need to actually track all these events as move events and potentially remove children from parents first
        // TODO: we also need to modify the cycle check to first add in the new cild and then check for cycles
      }
    })
    // TODO: go through and build the parentChildMap from the childParentMap (using the logoot sequence in the payload)

    /*     const reorderEvents = await this.eventLog.getAllEventsFromType(EventType.REORDER_CHILD)
    reorderEvents.events.forEach((event) => {
      const childOrderEventPayload = event.payload as ReorderChildNodeEventPayload
      EventlogRepository.insertInParentChildMap(
        newParentChildMap,
        childOrderEventPayload.childId,
        childOrderEventPayload.parentId,
        childOrderEventPayload.position,
        this.eventLog.getPeerId()
      )
    })
 */ this.childParentMap = newChildParentMap
    this.parentChildMap = newParentChildMap
  }

  private static causesCycle(
    childParentMap: { [key in string]: string },
    childId: string,
    parentId: string
  ): boolean {
    let currentNode = parentId
    while (currentNode) {
      const ancestor = childParentMap[currentNode]
      if (ancestor) {
        if (ancestor === childId) {
          return true
        }
        currentNode = ancestor
      }
    }
    return false
  }

  private static insertInParentChildMap(
    parentChildMap,
    childId: string,
    parentId: string,
    position: atomIdent,
    peerId: string
  ): void {
    const seq: LogootSequenceWrapper = EventlogRepository.getOrCreateSeqForParent(
      parentChildMap,
      parentId,
      peerId
    )
    seq.insertAtAtomIdent(childId, position)
  }

  createNode(
    id: string,
    parentId: string,
    name: string,
    content: string,
    synchronous: boolean,
    relativePosition: RelativeNodePosition
  ): Promise<void> {
    const position = this.determineNewPositionForChild(id, parentId, relativePosition)
    return this.eventLog.publish(
      id,
      parentId,
      createNewDEventPayload(name, content, false, false, false, position),
      synchronous
    )
  }

  // TODO: consider merging this with reparentnode in the future
  async updateNode(node: RepositoryNode, parentId: string, synchronous: boolean): Promise<void> {
    /* if (!!node.deleted) {
      // here we assume the node just got deleted, this is not necessarily correct, one could
      // also update a node that was already deleted but doing it twice doesn't hurt? And we
      // have no good way to recognize if it was really deleted
      const parentId = this.childParentMap[node._id]
      if (!parentId) {
        throw new Error(`Parent not known for node ${node._id} therefore can not delete this node`)
      }
      await this.deleteNode(node._id, parentId, synchronous)
    } */
    await this.eventLog.publish(
      node._id,
      parentId,
      createNewDEventPayload(
        node.name,
        node.note,
        !!node.deleted,
        !!node.collapsed,
        !!node.completed,
        this.getOrCreatePositionForChild(node._id, parentId)
      ),
      synchronous
    )
  }

  private getOrCreatePositionForChild(nodeId: string, parentId: string): atomIdent {
    const seq: LogootSequenceWrapper = EventlogRepository.getOrCreateSeqForParent(
      this.parentChildMap,
      parentId,
      this.eventLog.getPeerId()
    )
    const currentPosition = seq.getAtomIdentForItem(nodeId)
    if (!currentPosition) {
      return this.determineNewPositionForChild(nodeId, parentId, RELATIVE_NODE_POSITION_END)
    } else {
      return currentPosition
    }
  }

  private determineNewPositionForChild(
    nodeId: string,
    parentId: string,
    relativePosition: RelativeNodePosition
  ): atomIdent {
    const seq: LogootSequenceWrapper = EventlogRepository.getOrCreateSeqForParent(
      this.parentChildMap,
      parentId,
      this.eventLog.getPeerId()
    )
    return seq.insertElement(nodeId, relativePosition, this.eventLog.getCounter())
  }

  /**
   * implNote: We used to ONLY publish an INSERT event when the parent hadn't changed. This depended on
   * the fact that we would synchronously garbage collect our events and discard older, duplicate INSERT
   * events from the sequence. Since garbage collection is now asynchronous we now always publish the
   * DELETE event as well so we don't get duplicate nodes in our child lists.
   *
   * Assumption: we don't perform a cycle check here since we assume
   */
  async reparentNode(
    node: RepositoryNode,
    parentId: string,
    relativePosition: RelativeNodePosition,
    synchronous: boolean
  ): Promise<void> {
    // LOCAL: if we have a local change (not a remote peer) then we can directly update the cache without rebuilding
    this.childParentMap[node._id] = parentId
    const position = this.determineNewPositionForChild(node._id, parentId, relativePosition)
    return this.eventLog.publish(
      node._id,
      parentId,
      createNewDEventPayload(
        node.name,
        node.note,
        !!node.deleted,
        !!node.collapsed,
        !!node.completed,
        position,
        node.created
      ),
      synchronous
    )
  }

  private static getOrCreateSeqForParent(
    parentChildMap: { [key in string]: LogootSequenceWrapper },
    parentId: string,
    peerId: string
  ): LogootSequenceWrapper {
    return (
      parentChildMap[parentId] || (parentChildMap[parentId] = new LogootSequenceWrapper(peerId))
    )
  }

  getParentId(nodeId: string): Promise<string> {
    return Promise.resolve(this.childParentMap[nodeId])
  }

  async loadNode(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<RepositoryNode> {
    return this.eventLog.getNodeEvent(nodeId).then((nodeEvent) => {
      if (nodeEvent) {
        const node = this.mapEventToRepositoryNode(nodeId, nodeEvent.payload)
        if (nodeFilter(node)) {
          return Promise.resolve(node)
        }
      }
    })
  }

  private mapEventToRepositoryNode(nodeId: string, eventPayload: DEventPayload): RepositoryNode {
    return {
      _id: nodeId,
      name: eventPayload.name,
      note: eventPayload.note,
      // tslint:disable-next-line:no-bitwise
      deleted: (eventPayload.flags & NodeFlags.deleted) === NodeFlags.deleted,
      // tslint:disable-next-line:no-bitwise
      collapsed: (eventPayload.flags & NodeFlags.collapsed) === NodeFlags.collapsed,
      // tslint:disable-next-line:no-bitwise
      completed: (eventPayload.flags & NodeFlags.completed) === NodeFlags.completed,
      created: eventPayload.created,
      updated: eventPayload.updated,
    }
  }

  /**
   * This implementation decides based on the amount of nodes that are in the tree we are loading
   * whether we can or should load it incrementally (node+children per node) or bulk load all
   * nodes and create the tree from that. The latter is faster for very large subtrees but also
   * very wasteful for small subtrees.
   */
  async loadTree(
    nodeId: string,
    nodeFilter: Predicate<RepositoryNode>,
    loadCollapsedChildren: boolean
  ): Promise<LoadedTree> {
    try {
      // const amountOfNodesToLoad = this.determineAmountOfNodesToLoad(nodeId)
      const tree = await this.loadTreeNodeRecursively(nodeId, nodeFilter, loadCollapsedChildren)
      // TODO: remove this code once I know what I want to do with tree loading , for now we just leave recursive loading
      // amountOfNodesToLoad < this.MAX_NODES_TO_LOAD_INDIVIDUALLY
      //   ? await this.loadTreeNodeRecursively(nodeId, nodeFilter, loadCollapsedChildren)
      //   : await this.loadTreeBulk(nodeId, nodeFilter, loadCollapsedChildren)
      if (!tree) {
        // since loadTreeNodRecursively can return null, we need to check it
        throw new NodeNotFoundError(`Node not found: ${nodeId}`)
      }
      const ancestors = await this.loadAncestors(nodeId, [])
      return { status: { state: State.LOADED }, tree, ancestors }
    } catch (reason) {
      if (reason instanceof NodeNotFoundError) {
        return { status: { state: State.NOT_FOUND } }
      } else {
        // tslint:disable-next-line:no-console
        console.error(`error while loading tree from eventlog: `, reason)
        return { status: { state: State.ERROR, msg: `Error loading tree` } }
      }
    }
  }

  /*
  private determineAmountOfNodesToLoad(nodeId: string): number {
    let childCount = 0
    for (const childNodeId of this.getChildIdsInternal(nodeId)) {
      childCount += this.determineAmountOfNodesToLoad(childNodeId)
    }
    return 1 + childCount
  }

    private async loadTreeBulk(
    nodeId: string,
    nodeFilter: Predicate<RepositoryNode>,
    loadCollapsedChildren: boolean
  ): Promise<ResolvedRepositoryNode> {
    const nodeEvents = await this.eventLog.getAllEvents()
    const nodeMap = new Map<string, RepositoryNode>()
    for (const nodeEvent of nodeEvents.events) {
      nodeMap.set(
        nodeEvent.nodeId,
        this.mapEventToRepositoryNode(nodeEvent.nodeId, nodeEvent.payload)
      )
    }
    return this.loadTreeNodeBulk(nodeId, nodeMap, nodeFilter, loadCollapsedChildren)
  }

  private async loadTreeNodeBulk(
    nodeId: string,
    nodeMap: Map<string, RepositoryNode>,
    nodeFilter: Predicate<RepositoryNode>,
    loadCollapsedChildren: boolean
  ): Promise<ResolvedRepositoryNode> {
    const node = nodeMap.get(nodeId)
    if (!node) {
      throw new NodeNotFoundError(`Node not found in nodeMap with id ${nodeId}`)
    }
    if (!nodeFilter(node)) {
      return null
    }
    if (!node.collapsed || loadCollapsedChildren) {
      const children = await this.loadChildTreeNodesBulk(
        nodeId,
        nodeMap,
        nodeFilter,
        loadCollapsedChildren
      )
      return { node, children: { loaded: true, elements: children } }
    } else {
      // even if we do not load collapsed children, we optimize the case where the node is collapsed but has no children
      // in that case we can just pretend we loaded the child array
      const childIds = this.getChildIdsInternal(nodeId)
      return {
        node,
        children: {
          loaded: childIds.length === 0 ? true : false,
          elements: [],
        },
      }
    }
  }

  private async loadChildTreeNodesBulk(
    nodeId: string,
    nodeMap: Map<string, RepositoryNode>,
    nodeFilter: Predicate<RepositoryNode>,
    loadCollapsedChildren: boolean
  ): Promise<ResolvedRepositoryNode[]> {
    const children: ResolvedRepositoryNode[] = []
    const childIds = this.getChildIdsInternal(nodeId)
    for (const childNodeId of childIds) {
      const childNode = await this.loadTreeNodeBulk(
        childNodeId,
        nodeMap,
        nodeFilter,
        loadCollapsedChildren
      )
      if (childNode) {
        // node may have been filtered out, in that case omit
        children.push(childNode)
      }
    }
    return children
  }
 */
  private async loadTreeNodeRecursively(
    nodeId: string,
    nodeFilter: Predicate<RepositoryNode>,
    loadCollapsedChildren: boolean
  ): Promise<ResolvedRepositoryNode> {
    const node = await this.loadNode(nodeId, nodeFilter)
    if (!node) {
      return null // we can't throw here because of the filter: may be that the node is not included in the filter
    }
    const childIds = this.getChildIdsInternal(nodeId)
    if (!node.collapsed || loadCollapsedChildren) {
      const children = await Promise.all(
        childIds.map(
          async (childId) =>
            await this.loadTreeNodeRecursively(childId, nodeFilter, loadCollapsedChildren)
        )
      )
      // filter out nulls that are excluded because of the nodeFilter
      return {
        node,
        children: { loaded: true, elements: children.filter((c) => !!c) },
      }
    } else {
      // even if we do not load collapsed children, we optimize the case where the node is collapsed but has no children
      // in that case we can just pretend we loaded the child array
      return {
        node,
        children: {
          loaded: childIds.length === 0 ? true : false,
          elements: [],
        },
      }
    }
  }

  private getChildIdsInternal(nodeId: string): string[] {
    return this.parentChildMap[nodeId] ? this.parentChildMap[nodeId].toArray() : []
  }

  getChildIds(nodeId: string): Promise<string[]> {
    return Promise.resolve(this.getChildIdsInternal(nodeId))
  }

  private async loadAncestors(
    childId: string,
    ancestors: RepositoryNode[]
  ): Promise<RepositoryNode[]> {
    const parentId = this.childParentMap[childId]
    if (parentId && parentId !== ' ROOT') {
      const parent = await this.loadNode(parentId, ALWAYS_TRUE)
      ancestors.push(parent)
      return this.loadAncestors(parent._id, ancestors)
    } else {
      return Promise.resolve(ancestors)
    }
  }

  subscribeToChanges(
    parentNodeId: string,
    nodeChangeListener: (nodeId: string) => void
  ): Subscription {
    const subscription = new NodeChangedSubscription(
      parentNodeId,
      nodeChangeListener,
      // this is a bit strange: the subscription object has a cancel method for the subscriber to call
      // unsubscribing means we need to remove the subscription from our list, to do that we need to find
      // its index first, we do that by checking object equality on the subscription object
      (subToCancel) => {
        this.changeSubscriptions.splice(
          this.changeSubscriptions.findIndex((sub) => sub === subToCancel),
          1
        )
      }
    )
    this.changeSubscriptions.push(subscription)
    return subscription
  }
}

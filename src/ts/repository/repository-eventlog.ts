import {Repository} from './repository'
// tslint:disable-next-line:max-line-length
import { AddOrUpdateNodeEventPayload, DEventLog, EventType, ReparentNodeEventPayload, DEvent, ReorderChildNodeEventPayload, LogootReorderOperation, createNewAddOrUpdateNodeEventPayload } from '../eventlog/eventlog'
import { Predicate, debounce, ALWAYS_TRUE } from '../util'
// tslint:disable-next-line:max-line-length
import { LoadedTree, RepositoryNode, RelativeNodePosition, RelativeLinearPosition, State, Subscription, DeferredRepositoryNode, ResolvedRepositoryNode } from '../domain/domain'
import { atomIdent } from '../lib/logootsequence.js'
import { LogootSequenceWrapper } from './logoot-sequence-wrapper'

class NodeNotFoundError extends Error {}

class NodeChangedSubscription implements Subscription {
  constructor(
    readonly parentNode: string,
    readonly listener: (nodeId: string) => void,
    readonly cancelCallback: (subToCancel: Subscription) => void) {}

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
export class EventlogRepository implements Repository {

  private parentChildMap = {}
  private childParentMap = {}
  private changeSubscriptions: NodeChangedSubscription[] = []

  private readonly debouncedNotifyNodeChangeSubscribers = debounce(this.notifyNodeChangeSubscribers.bind(this), 5000)
  private readonly debouncedRebuildAndNotify = debounce(this.rebuildAndNotify.bind(this), 5000)

  // TODO: tweak this magic number
  // this is the limit after which we will bulk load all nodes instead of loading a tree incrementally
  private readonly MAX_NODES_TO_LOAD_INDIVIDUALLY = 500

  constructor(readonly eventLog: DEventLog) {}

  init(): Promise<EventlogRepository> {
    return this.rebuildTreeStructureMaps().then(() => {
      // TODO: this is not great: we rebuild the maps, then subscribe and theoretically we could get
      // a bunch of events coming in forcing us to rebuild again. But using the debounced function above
      // would mean delaying the inital map construction for too long...
      // TODO: also this is the only subscriber at the moment, we already filter by originator,
      // but if a ton of remote events would come in we are fucked
      this.eventLog.subscribe({
        notify: this.eventLogListener.bind(this),
        filter: (event) => event.originator !== this.eventLog.getPeerId() })
      }).then(() => this)
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
      if (event.type === EventType.REORDER_CHILD || event.type === EventType.REPARENT_NODE) {
        // in case of structural tree changes we need to rebuild the maps first, then notify,
        // otherwise we would miss new nodes being added (as they would not be in the tree structure maps)
        this.debouncedRebuildAndNotify(event.nodeId)
      } else {
        this.debouncedNotifyNodeChangeSubscribers(event.nodeId)
      }
    }
  }

  private rebuildAndNotify(nodeId: string): void {
    this.rebuildTreeStructureMaps().then(() => this.notifyNodeChangeSubscribers(nodeId))
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

  private async rebuildTreeStructureMaps(): Promise<void> {
    const newChildParentMap = {}
    const newParentChildMap = {}
    // TODO: perf, redo these in separate calls for each event type (faster because index)
    const events = await this.eventLog.getEventsSince([EventType.REPARENT_NODE, EventType.REORDER_CHILD], -1)
    events.events.forEach(event => {
      if (event.type === EventType.REPARENT_NODE) {
        const treeEventPayload = event.payload as ReparentNodeEventPayload
        const nodeId = event.nodeId
        const parentId = treeEventPayload.parentId
        newChildParentMap[nodeId] = parentId
      } else if (event.type === EventType.REORDER_CHILD) {
        const childOrderEventPayload = event.payload as ReorderChildNodeEventPayload
        EventlogRepository.insertInParentChildMap(
          newParentChildMap,
          childOrderEventPayload.childId,
          childOrderEventPayload.parentId,
          childOrderEventPayload.operation,
          childOrderEventPayload.position,
          this.eventLog.getPeerId())
      }
    })
    // this is an attempt at an "atomic" update: we only replace the existing maps once we
    // have the new ones, to avoid having intermediate request accessing some weird state
    this.childParentMap = newChildParentMap
    this.parentChildMap = newParentChildMap
  }

  private static insertInParentChildMap(parentChildMap, childId: string, parentId: string,
                                        operation: LogootReorderOperation, position: atomIdent, peerId: string): void {
    const seq: LogootSequenceWrapper<string> = EventlogRepository.getOrCreateSeqForParent(
      parentChildMap, parentId, peerId)
    if (operation === LogootReorderOperation.DELETE) {
      seq.deleteAtAtomIdent(position)
    } else {
      seq.insertAtAtomIdent(childId, position)
    }
  }

  createNode(id: string, name: string, content: string, synchronous: boolean): Promise<void> {
    return this.eventLog.publish(
      EventType.ADD_OR_UPDATE_NODE,
      id,
      createNewAddOrUpdateNodeEventPayload(name, content, false, false, false),
      synchronous)
  }

  updateNode(node: RepositoryNode, synchronous: boolean): Promise<void> {
    if (!!node.deleted) {
      // here we assume the node just got deleted, this is not necessarily correct, one could
      // also update a node that was already deleted but doing it twice doesn't hurt? And we
      // have no good way to recognize if it was really deleted
      const parentId = this.childParentMap[node._id]
      if (! parentId) {
        throw new Error(`Parent not known for node ${node._id} therefore can not delete this node`)
      }
      this.deleteNode(node._id, parentId, synchronous)
    }
    return this.eventLog.publish(
      EventType.ADD_OR_UPDATE_NODE,
      node._id,
      createNewAddOrUpdateNodeEventPayload(
        node.name,
        node.note,
        !!node.deleted,
        !!node.collapsed,
        !!node.completed,
        node.created,
      ),
      synchronous)
  }

  /**
   * implNote: We used to ONLY publish an INSERT event when the parent hadn't changed. This depended on
   * the fact that we would synchronously garbage collect our events and discard older, duplicate INSERT
   * events from the sequence. Since garbage collection is now asynchronous we now always publish the
   * DELETE event as well so we don't get duplicate nodes in our child lists.
   */
  async reparentNode(childId: string, parentId: string, position: RelativeNodePosition, synchronous: boolean): Promise<void> {
    const oldParentId = this.childParentMap[childId]
    if (oldParentId) {
      // always publish a delete event if the node was already in the child list:
      // if we move to a new parent the node needs to disappear unde the old parent
      // and if we move inside of the existing parent, then we don't want to see that node
      // appear multiple times.
      await this.deleteNode(childId, oldParentId, synchronous)
    }
    const seq: LogootSequenceWrapper<string> = EventlogRepository.getOrCreateSeqForParent(
      this.parentChildMap, parentId, this.eventLog.getPeerId())
    const insertionIndex = this.getChildInsertionIndex(seq, position)
    const insertionAtomIdent = seq.getAtomIdentForInsertionIndex(insertionIndex, this.eventLog.getCounter())
    // console.log(`reparenting node ${childId} to index `, insertionIndex, ` with position `, position, ` with atomIdent `, insertionAtomIdent)
    // LOCAL: if we have a local change (not a remote peer) then we can directly update the cache without rebuilding
    this.childParentMap[childId] = parentId
    seq.insertAtAtomIdent(childId, insertionAtomIdent)
    if (oldParentId !== parentId) {
      // publish a reparent event when we have a new parent
      await this.eventLog.publish(EventType.REPARENT_NODE, childId, { parentId }, synchronous)
    }
    // publish insert reorder event on new parent
    return this.eventLog.publish(
      EventType.REORDER_CHILD,
      parentId,
      {
        operation: LogootReorderOperation.INSERT,
        position: insertionAtomIdent,
        childId,
        parentId,
      },
      synchronous)
  }

  private deleteNode(childId: string, parentId: string, synchronous: boolean): Promise<void> {
    // delete the child at the old parent
    const seq: LogootSequenceWrapper<string> = this.parentChildMap[parentId]
    if (seq) {
      const indexOfChild = seq.toArray().indexOf(childId)
      if (indexOfChild >= 0) {
        console.log(`removing child from local sequence in cache`)
        // ordering here is crucial: get the atom ident first, and THEN delete the item, otherwise
        // it is the wrong value
        const deletionAtomIdent = seq.getAtomIdent(indexOfChild)
        seq.deleteAtIndex(indexOfChild)
        console.log(`publishing child delete event`)
        return this.eventLog.publish(
          EventType.REORDER_CHILD,
          parentId,
          {
            operation: LogootReorderOperation.DELETE,
            position: deletionAtomIdent,
            childId,
            parentId,
          },
          synchronous)
      }
    }
    return Promise.resolve()
  }

  private static getOrCreateSeqForParent(
      parentChildMap, parentId: string, peerId: string): LogootSequenceWrapper<string> {
    return parentChildMap[parentId] || (parentChildMap[parentId] = new LogootSequenceWrapper<string>(peerId))
  }

  private getChildInsertionIndex(seq: LogootSequenceWrapper<string>, position: RelativeNodePosition): number {
    if (position.beforeOrAfter === RelativeLinearPosition.BEGINNING) {
      return 0
    } else if (position.beforeOrAfter === RelativeLinearPosition.AFTER) {
      // TODO: We default to insert at the beginning of the sequence when we can not find the after Node, is this right?
      const afterNodeIndex = seq.toArray().indexOf(position.nodeId)
      if (afterNodeIndex === -1) {
        return 0
      } else {
        return afterNodeIndex + 1
      }
    } else if (position.beforeOrAfter === RelativeLinearPosition.BEFORE) {
      // TODO: We default to insert at the beginning of the sequence when we can not find the before Node, is this right?
      const beforeNodeIndex = seq.toArray().indexOf(position.nodeId)
      if (beforeNodeIndex === -1) {
        return 0
      } else {
        return beforeNodeIndex
      }
    } else if (position.beforeOrAfter === RelativeLinearPosition.END) {
      return seq.length()
    }
  }

  getChildIds(nodeId: string): Promise<string[]> {
    const childIdsSeq = this.parentChildMap[nodeId]
    return Promise.resolve(childIdsSeq ? childIdsSeq.toArray() : [])
  }

  getParentId(nodeId: string): Promise<string> {
    return Promise.resolve(this.childParentMap[nodeId])
  }

  async loadNode(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<RepositoryNode> {
    return this.eventLog.getNodeEvent(nodeId).then(nodeEvent => {
      if (!nodeEvent) {
        return Promise.resolve(null)
      }
      const node = this.mapEventToRepositoryNode(nodeId, nodeEvent.payload as AddOrUpdateNodeEventPayload)
      if (nodeFilter(node)) {
        return Promise.resolve(node)
      } else {
        return Promise.resolve(null)
      }
    })
  }

  private mapEventToRepositoryNode(nodeId: string, eventPayload: AddOrUpdateNodeEventPayload): RepositoryNode {
    return {
      _id: nodeId,
      name: eventPayload.name,
      note: eventPayload.note,
      deleted: eventPayload.deleted,
      collapsed: eventPayload.collapsed,
      completed: eventPayload.completed,
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
  async loadTree(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<LoadedTree> {
    try {
      const amountOfNodesToLoad = this.determineAmountOfNodesToLoad(nodeId)
      const tree = amountOfNodesToLoad < this.MAX_NODES_TO_LOAD_INDIVIDUALLY
        ? await this.loadTreeNodeRecursively(nodeId, nodeFilter)
        : await this.loadTreeBulk(nodeId, nodeFilter)
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
        return { status: { state: State.ERROR, msg: `Error loading tree: ${reason}` } }
      }
    }
  }

  private determineAmountOfNodesToLoad(nodeId: string): number {
    let childCount = 0
    for (const childNodeId of this.getChildren(nodeId)) {
      childCount += this.determineAmountOfNodesToLoad(childNodeId)
    }
    return 1 + childCount
  }

  private async loadTreeBulk(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<ResolvedRepositoryNode> {
    const nodeEvents = await this.eventLog.getEventsSince([EventType.ADD_OR_UPDATE_NODE], -1)
    const nodeMap: Map<string, RepositoryNode> = new Map()
    for (const nodeEvent of nodeEvents.events) {
      nodeMap.set(nodeEvent.nodeId, this.mapEventToRepositoryNode(nodeEvent.nodeId, nodeEvent.payload as AddOrUpdateNodeEventPayload))
    }
    return this.loadTreeNodeBulk(nodeId, nodeMap, nodeFilter)
  }

  private async loadTreeNodeBulk(nodeId: string, nodeMap: Map<string, RepositoryNode>, nodeFilter: Predicate<RepositoryNode>): Promise<ResolvedRepositoryNode> {
    const node = nodeMap.get(nodeId)
    if (! node) {
      throw new NodeNotFoundError(`Node not found in nodeMap with id ${nodeId}`)
    }
    if (! nodeFilter(node)) {
      return null
    }
    if (node.collapsed) {
      const childIds = this.getChildren(nodeId)
      return {
        node,
        children: childIds.length !== 0 ? null : [], // This is a marker: if the array is not empty then we just did not load it!
      }
    } else {
      const children = await this.loadChildTreeNodesBulk(nodeId, nodeMap, nodeFilter)
      return {node, children}
    }
  }

  private async loadChildTreeNodesBulk(nodeId: string, nodeMap: Map<string, RepositoryNode>, nodeFilter: Predicate<RepositoryNode>): Promise<ResolvedRepositoryNode[]> {
    const children: ResolvedRepositoryNode[] = []
    for (const childNodeId of this.getChildren(nodeId)) {
      const childNode = await this.loadTreeNodeBulk(childNodeId, nodeMap, nodeFilter)
      if (childNode) { // node may have been filtered out, in that case omit
        children.push(childNode)
      }
    }
    return children
  }

  private async loadTreeNodeRecursively(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<ResolvedRepositoryNode> {
    const node = await this.loadNode(nodeId, nodeFilter)
    if (! node) {
      return null // we can't throw here because of the filter: may be that the node is not included in the filter
    }
    const childIds = this.getChildren(nodeId)
    if (node.collapsed) {
      return {
        node,
        children: childIds.length !== 0 ? null : [], // This is a marker: if the array is not empty then we just did not load it!
      }
    } else {
      const children = await Promise.all(childIds.map(async childId => await this.loadTreeNodeRecursively(childId, nodeFilter)))
      // filter out nulls that are excluded because of the nodeFilter
      return { node, children: children.filter(c => !!c) }
    }
  }

  private getChildren(nodeId: string): string[] {
    return this.parentChildMap[nodeId] ? this.parentChildMap[nodeId].toArray() : []
  }

  private async loadAncestors(childId: string, ancestors: RepositoryNode[]): Promise<RepositoryNode[]> {
    const parentId = this.childParentMap[childId]
    if (parentId && parentId !== ' ROOT') {
      const parent = await this.loadNode(parentId, ALWAYS_TRUE)
      ancestors.push(parent)
      return this.loadAncestors(parent._id, ancestors)
    } else {
      return Promise.resolve(ancestors)
    }
  }

  subscribeToChanges(parentNodeId: string, nodeChangeListener: (nodeId: string) => void): Subscription {
    const subscription = new NodeChangedSubscription(
      parentNodeId,
      nodeChangeListener,
      // this is a bit strange: the subscription object has a cancel method for the subscriber to call
      // unsubscribing means we need to remove the subscription from our list, to do that we need to find
      // its index first, we do that by checking object equality on the subscription object
      (subToCancel) => {
        this.changeSubscriptions.splice(this.changeSubscriptions.findIndex((sub) => sub === subToCancel), 1)
      })
    this.changeSubscriptions.push(subscription)
    return subscription
  }
}

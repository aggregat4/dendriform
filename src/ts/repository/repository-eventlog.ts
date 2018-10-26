import {Repository} from './repository'
// tslint:disable-next-line:max-line-length
import { AddOrUpdateNodeEventPayload, DEventLog, EventType, ReparentNodeEventPayload, DEvent, ReorderChildNodeEventPayload, LogootReorderOperation } from '../eventlog/eventlog'
import { Predicate, debounce, ALWAYS_TRUE } from '../util'
// tslint:disable-next-line:max-line-length
import { LoadedTree, RepositoryNode, RelativeNodePosition, RelativeLinearPosition, State, ResolvedRepositoryNode } from '../domain/domain'
import {atomIdent} from '../lib/logootsequence.js'
import {LogootSequenceWrapper} from './logoot-sequence-wrapper'

class NodeNotFoundError extends Error {}

/**
 * This is a repository implementation that uses an event log that synchronises with a remote eventlog
 * to provide an eventually consistent, multi-peer, storage backend.
 */
export class EventlogRepository implements Repository {

  private parentChildMap = {}
  private childParentMap = {}
  private readonly debouncedTreeRebuild = debounce(this.rebuildTreeStructureMaps.bind(this), 5000)

  constructor(readonly nodeEventLog: DEventLog<AddOrUpdateNodeEventPayload>,
              readonly treeEventLog: DEventLog<ReparentNodeEventPayload>,
              readonly childOrderEventLog: DEventLog<ReorderChildNodeEventPayload>) {}

  init(): Promise<EventlogRepository> {
    return this.rebuildTreeStructureMaps().then(() => {
      // TODO: this is not great: we rebuild the maps, then subscribe and theoretically we could get
      // a bunch of events coming in forcing us to rebuild again. But using the debounced function above
      // would mean delaying the inital map construction for too long...
      this.nodeEventLog.subscribe({
        notify: this.nodeEventLogListener,
        filter: (event) => event.originator !== this.nodeEventLog.getId() })
      this.treeEventLog.subscribe({
        notify: this.treeEventLogListener,
        filter: (event) => event.originator !== this.treeEventLog.getId() })
    }).then(() => this)
  }

  private nodeEventLogListener(event: DEvent<AddOrUpdateNodeEventPayload>): void {
    // DO NOTHING (?)
  }

  /**
   * Tree structure changes that do not originate from the current peer means that
   * some other peer has made changes to the tree and we just got one or more events
   * about it. To be safe, and to avoid having to do something clever, we just trigger
   * a complete rebuild of the parent/child caches. we debounch the function so when
   * many events come in fast we don't do too much work.
   */
  private treeEventLogListener(event: DEvent<ReparentNodeEventPayload>): void {
    this.debouncedTreeRebuild()
  }

  private rebuildTreeStructureMaps(): Promise<any> {
    return this.treeEventLog.getEventsSince(0)
      .then(treeEvents => {
        const newChildParentMap = {}
        treeEvents.events.forEach(event => {
          const nodeId = event.nodeId
          const parentId = event.payload.parentId
          newChildParentMap[nodeId] = parentId
        })
        // this is an attempt at an "atomic" update: we only replace the existing maps once we
        // have the new ones, to avoid having intermediate request accessing some weird state
        this.childParentMap = newChildParentMap
      })
      .then(() => this.childOrderEventLog.getEventsSince(0))
      .then(childOrderEvents => {
        const newParentChildMap = {}
        childOrderEvents.events.forEach(event => {
          EventlogRepository.insertInParentChildMap(newParentChildMap, event.payload.childId, event.payload.parentId,
            event.payload.operation, event.payload.position, this.childOrderEventLog.getId())
        })
        this.parentChildMap = newParentChildMap
      })
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

  createNode(id: string, name: string, content: string): Promise<void> {
    return this.nodeEventLog.publish(
      EventType.ADD_OR_UPDATE_NODE,
      id,
      {name, note: content, deleted: false, collapsed: false})
  }

  updateNode(node: RepositoryNode): Promise<void> {
    if (!!node.deleted) {
      // here we assume the node just got deleted, this is not necessarily correct, one could
      // also update a node that was already deleted but doing it twice doesn't hurt? And we
      // have no good way to recognize if it was really deleted
      const parentId = this.childParentMap[node._id]
      if (! parentId) {
        throw new Error(`Parent not known for node ${node._id} therefore can not delete this node`)
      }
      this.deleteNode(node._id, parentId)
    }
    return this.nodeEventLog.publish(
      EventType.ADD_OR_UPDATE_NODE,
      node._id,
      {name: node.name, note: node.content, deleted: !!node.deleted, collapsed: !!node.collapsed})
  }

  // We ONLY publish an INSERT event when the parent hasn't changed, this DEPENDS on the fact that
  // eventlogs will garbage collect older insert events in the same sequence, if this is not the
  // case then we would need to publish a delete event before this
  async reparentNode(childId: string, parentId: string, position: RelativeNodePosition): Promise<void> {
    const oldParentId = this.childParentMap[childId]
    const seq: LogootSequenceWrapper<string> = EventlogRepository.getOrCreateSeqForParent(
      this.parentChildMap, parentId, this.childOrderEventLog.getId())
    const insertionIndex = this.getChildInsertionIndex(seq, position)
    const insertionAtomIdent = seq.getAtomIdentForInsertionIndex(insertionIndex, this.childOrderEventLog.getCounter())
    // console.log(`reparenting node ${childId} to index `, insertionIndex, ` with position `, position, ` with atomIdent `, insertionAtomIdent)
    // LOCAL: if we have a local change (not a remote peer) then we can directly update the cache without rebuilding
    this.childParentMap[childId] = parentId
    seq.insertAtAtomIdent(childId, insertionAtomIdent)
    // REMOTE: make the remote update
    if (oldParentId && oldParentId !== parentId) {
      // publish a delete event on the old parent if there was a different old parent
      await this.deleteNode(childId, oldParentId)
    }
    if (oldParentId !== parentId) {
      // publish a reparent event when we have a new parent
      await this.treeEventLog.publish(EventType.REPARENT_NODE, childId, { parentId })
    }
    // publish insert reorder event on new parent
    return this.childOrderEventLog.publish(
      EventType.REORDER_CHILD,
      parentId,
      {
        operation: LogootReorderOperation.INSERT,
        position: insertionAtomIdent,
        childId,
        parentId,
      })
  }

  private deleteNode(childId: string, parentId: string): Promise<void> {
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
        return this.childOrderEventLog.publish(
          EventType.REORDER_CHILD,
          parentId,
          {
            operation: LogootReorderOperation.DELETE,
            position: deletionAtomIdent,
            childId,
            parentId,
          })
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
      const afterNodeIndex = seq.toArray().indexOf(position.nodeId) || -1
      return afterNodeIndex + 1
    } else if (position.beforeOrAfter === RelativeLinearPosition.BEFORE) {
      // TODO: We default to insert at the beginning of the sequence when we can not find the after Node, is this right?
      const beforeNodeIndex = seq.toArray().indexOf(position.nodeId) || 0
      return beforeNodeIndex
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
    return this.nodeEventLog.getEventsForNode(nodeId).then(nodeEvents => {
      if (nodeEvents.length > 1) {
        throw new Error(`The code does not yet support more than one event per node`)
      }
      if (nodeEvents.length === 0) {
        return Promise.resolve(null)
      }
      const node = this.mapEventToRepositoryNode(nodeEvents[0])
      if (nodeFilter(node)) {
        return Promise.resolve(node)
      } else {
        return Promise.resolve(null)
      }
    })
  }

  private mapEventToRepositoryNode(event: DEvent<AddOrUpdateNodeEventPayload>): RepositoryNode {
    return {
      _id: event.nodeId,
      name: event.payload.name,
      content: event.payload.note,
      deleted: event.payload.deleted,
      collapsed: event.payload.collapsed,
    }
  }

  loadTree(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<LoadedTree> {
    return Promise.all([
      this.loadTreeNodeRecursively(nodeId, nodeFilter),
      this.loadAncestors(nodeId, []) ])
    .then(results => Promise.resolve({ status: { state: State.LOADED }, tree: results[0], parents: results[1] }) )
    .catch((reason) => {
      if (reason instanceof NodeNotFoundError) {
        return Promise.resolve({ status: { state: State.NOT_FOUND } })
      } else {
        // tslint:disable-next-line:no-console
        console.error(`error while loading tree from eventlog: `, reason)
        return Promise.resolve({ status: { state: State.ERROR, msg: `Error loading tree: ${reason}` } })
      }
    })
  }

  private async loadTreeNodeRecursively(nodeId: string, nodeFilter: Predicate<RepositoryNode>):
      Promise<ResolvedRepositoryNode> {
    const node = await this.loadNode(nodeId, nodeFilter)
    if (! node) {
      throw new NodeNotFoundError()
    }
    return Promise.all(this.getChildren(nodeId).map(
        childId => this.loadTreeNodeRecursively(childId, nodeFilter)) as Array<Promise<ResolvedRepositoryNode>>)
      .then(children => ({
        node,
        children,
      }))
  }

  private getChildren(nodeId: string): string[] {
    return this.parentChildMap[nodeId] ? this.parentChildMap[nodeId].toArray() : []
  }

  private loadAncestors(childId: string, ancestors: RepositoryNode[]): Promise<RepositoryNode[]> {
    const parentId = this.childParentMap[childId]
    if (parentId && parentId !== ' ROOT') {
      return this.loadNode(parentId, ALWAYS_TRUE)
        .then(parent => {
          ancestors.push(parent)
          return this.loadAncestors(parent._id, ancestors)
        })
    } else {
      return Promise.resolve(ancestors)
    }
  }

}

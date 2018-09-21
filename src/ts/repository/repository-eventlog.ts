import {Repository} from './repository'
// tslint:disable-next-line:max-line-length
import { AddOrUpdateNodeEventPayload, DEventLog, DEventSource, EventType, ReparentNodeEventPayload, DEvent, ReorderChildNodeEventPayload, LogootReorderOperation } from '../eventlog/eventlog'
import { Predicate, debounce, ALWAYS_TRUE } from '../util'
// tslint:disable-next-line:max-line-length
import { LoadedTree, RepositoryNode, RelativeNodePosition, RelativeLinearPosition, State, ResolvedRepositoryNode } from '../domain/domain'
import {atomIdent, emptySequence, insertAtom, genAtomIdent, compareAtomIdents} from '../lib/logootsequence.js'

function insertMut(sequence, index, atom) {
  sequence.splice(index, 0, atom)
  return sequence
}

/**
 * A sequence of unique items, the uniqueness invariant is important since
 * we may use it to cache locations of items in the sequence for fast insertion.
 */
class LogootSequence<T> {
  private sequence = emptySequence()

  constructor(readonly peerId: string) {}

  insertAtAtomIdent(item: T, pos: atomIdent): void {
    insertAtom(this.sequence, [pos, item], insertMut)
  }

  deleteAtAtomIdent(pos: atomIdent): void {
    let deletePos = -1
    for (let i = 1; i < this.sequence.length - 1; i++) {
      if (compareAtomIdents(pos, this.sequence[i][0]) === 0) {
        deletePos = i
        break
      }
    }
    if (deletePos >= 0 && deletePos < this.sequence.length) {
      this.sequence.splice(deletePos, 1)
    }
    // TODO: throw error when index not found?
  }

  getAtomIdent(pos: number): atomIdent {
    if (pos < 0 || pos >= this.length()) {
      throw new Error(`Invalid positionn ${pos}`)
    }
    return this.sequence[pos + 1][0]
  }

  /**
   * Element will be inserted at pos and everything starting with pos will be shifted right.
   * If pos is >= sequence.length then it will be appended.
   * The position is relative to the the externalarray range for this sequence not its internal representation.
   */
  insertAtIndex(item: T, pos: number, peerClock): void {
    const atomId = this.getAtomIdentForInsertionIndex(pos, peerClock)
    this.insertAtAtomIdent(item, atomId)
  }

  getAtomIdentForInsertionIndex(pos: number, peerClock): atomIdent {
    if (pos < 0) {
      throw new Error(`Invalid positionn ${pos}`)
    }
    return pos >= this.length()
      ? genAtomIdent(
        this.peerId,
        peerClock,
        this.sequence[this.sequence.length - 2][0],
        this.sequence[this.sequence.length - 1][0])
      : genAtomIdent(
        this.peerId,
        peerClock,
        this.sequence[pos][0],
        this.sequence[pos + 1][0])
  }

  deleteAtIndex(pos: number): void {
    if (pos < 0 || pos >= this.length()) {
      throw new Error(`Trying to remove element at pos ${pos} which is out of bounds for this logootsequence`)
    }
    this.sequence.splice(pos + 1, 1)
  }

  length(): number {
    return this.sequence.length - 2
  }

  toArray(): T[] {
    // cut off the marker items at the beginning and the end
    return this.sequence.slice(1, -1).map(atom => atom[1])
  }
}

/**
 * This is a repository implementation that uses an event log that synchronises with a remote eventlog
 * to provide an eventually consistent, multi-peer, storage backend.
 */
export class EventlogRepository implements Repository {

  private parentChildMap = {}
  private childParentMap = {}
  private readonly debouncedTreeRebuild = debounce(this.rebuildTreeStructureMaps.bind(this), 5000)

  constructor(readonly nodeEventLog: DEventLog<AddOrUpdateNodeEventPayload>,
              readonly nodeEventSource: DEventSource<AddOrUpdateNodeEventPayload>,
              readonly treeEventLog: DEventLog<ReparentNodeEventPayload>,
              readonly treeEventSource: DEventSource<ReparentNodeEventPayload>,
              readonly childOrderEventLog: DEventLog<ReorderChildNodeEventPayload>,
              readonly childOrderEventSource: DEventSource<ReorderChildNodeEventPayload>) {
    this.rebuildTreeStructureMaps().then(() => {
      // TODO: this is not great: we rebuild the maps, then subscribe and theoretically we could get
      // a bunch of events coming in forcing us to rebuild again. But using the debounced function above
      // would mean delaying the inital map construction for too long...
      nodeEventLog.subscribe({
        notify: this.nodeEventLogListener,
        filter: (event) => event.originator !== this.nodeEventLog.getId() })
      treeEventLog.subscribe({
        notify: this.treeEventLogListener,
        filter: (event) => event.originator !== this.treeEventLog.getId() })
    })
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
          this.insertInParentChildMap(event.payload.childId, event.payload.parentId,
            event.payload.operation, event.payload.position)
        })
        this.parentChildMap = newParentChildMap
      })
  }

  private insertInParentChildMap(childId: string, parentId: string,
                                 operation: LogootReorderOperation, position: atomIdent): void {
    const seq: LogootSequence<string> = this.getOrCreateSeqForParent(parentId)
    if (operation === LogootReorderOperation.DELETE) {
      seq.deleteAtAtomIdent(position)
    } else {
      seq.insertAtAtomIdent(childId, position)
    }
  }

  createNode(id: string, name: string, content: string): Promise<void> {
    return this.nodeEventSource.publish(
      EventType.ADD_OR_UPDATE_NODE,
      id,
      {name, note: content, deleted: false, collapsed: false})
  }

  updateNode(node: RepositoryNode): Promise<void> {
    return this.nodeEventSource.publish(
      EventType.ADD_OR_UPDATE_NODE,
      node._id,
      {name: node.name, note: node.content, deleted: !!node.deleted, collapsed: !!node.collapsed})
  }

  // We ONLY publish an INSERT event when the parent hasn't changed, this DEPENDS on the fact that
  // eventlogs will garbage collect older insert events in the same sequence, if this is not the
  // case then we would need to publish a delete event before this
  async reparentNode(childId: string, parentId: string, position: RelativeNodePosition): Promise<void> {
    const oldParentId = this.childParentMap[childId]
    // if we have a local change (not a remote peer) then we can directly update the cache without rebuilding
    this.updateTreeStructureMaps(childId, parentId, position)
    const seq: LogootSequence<string> = this.getOrCreateSeqForParent(parentId)
    const insertionIndex = this.getChildInsertionIndex(seq, position)
    const insertionAtomIdent = seq.getAtomIdentForInsertionIndex(insertionIndex, this.childOrderEventLog.getCounter())
    if (oldParentId && oldParentId !== parentId) {
      // publish a delete event on the old parent if there was a different old parent
      const oldSeq: LogootSequence<string> = this.parentChildMap[oldParentId]
      if (oldSeq) {
        const oldArray = oldSeq.toArray()
        const indexOfChild = oldArray.indexOf(childId)
        if (indexOfChild >= 0) {
          const deletionAtomIdent = oldSeq.getAtomIdent(indexOfChild)
          await this.childOrderEventSource.publish(
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
    }
    if (oldParentId !== parentId) {
      // publish a reparent event when we have a new parent
      await this.treeEventSource.publish(EventType.REPARENT_NODE, childId, { parentId })
    }
    // publish insert reorder event on new parent
    return this.childOrderEventSource.publish(
      EventType.REORDER_CHILD,
      parentId,
      {
        operation: LogootReorderOperation.INSERT,
        position: insertionAtomIdent,
        childId,
        parentId,
      })
  }

  private updateTreeStructureMaps(childId: string, parentId: string, position: RelativeNodePosition): void {
    const oldParentId = this.childParentMap[childId]
    this.childParentMap[childId] = parentId
    // delete the child at the old parent
    const oldSeq: LogootSequence<string> = this.parentChildMap[oldParentId]
    if (oldSeq) {
      const oldArray = oldSeq.toArray()
      const indexOfChild = oldArray.indexOf(childId)
      if (indexOfChild >= 0) {
        oldSeq.deleteAtIndex(indexOfChild)
      }
    }
    // insert the child at the new parent
    const newSeq: LogootSequence<string> = this.getOrCreateSeqForParent(parentId)
    newSeq.insertAtIndex(childId, this.getChildInsertionIndex(newSeq, position), this.childOrderEventLog.getCounter())
  }

  private getOrCreateSeqForParent(parentId: string): LogootSequence<string> {
    return this.parentChildMap[parentId] ||
      (this.parentChildMap[parentId] = new LogootSequence<string>(this.childOrderEventLog.getId()))
  }

  private getChildInsertionIndex(seq: LogootSequence<string>, position: RelativeNodePosition): number {
    if (position.beforeOrAfter === RelativeLinearPosition.BEGINNING) {
      return 0
    } else if (position.beforeOrAfter === RelativeLinearPosition.AFTER) {
      // TODO: We default to insert at the beginning of the sequence when we can not find the after Node, is this right?
      const afterNodeIndex = seq.toArray().indexOf(position.nodeId) || -1
      return afterNodeIndex + 1
    } else if (position.beforeOrAfter === RelativeLinearPosition.BEFORE) {
      // TODO: We default to insert at the beginning of the sequence when we can not find the after Node, is this right?
      const beforeNodeIndex = seq.toArray().indexOf(position.nodeId) || 1
      return beforeNodeIndex - 1
    } else if (position.beforeOrAfter === RelativeLinearPosition.END) {
      return seq.length()
    }
  }

  getChildIds(nodeId: string): Promise<string[]> {
    return Promise.resolve(this.parentChildMap[nodeId])
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
    return this.parentChildMap[nodeId] || []
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

class NodeNotFoundError extends Error {}

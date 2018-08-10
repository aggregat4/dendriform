/**
 * This is a repository implementation that uses an event log that synchronises with a remote eventlog
 * to provide an eventually consistent, multi-peer, storage backend.
 */
import {Repository} from './repository'
// tslint:disable-next-line:max-line-length
import { AddOrUpdateNodeEventPayload, DEventLog, DEventSource, EventType, ReparentNodeEventPayload, DEvent } from '../eventlog/eventlog'
import { Predicate, debounce } from '../util'
// tslint:disable-next-line:max-line-length
import { LoadedTree, RepositoryNode, RelativeNodePosition, RelativeLinearPosition, BEGINNING_NODELIST_MARKER, END_NODELIST_MARKER } from '../domain/domain'

export class EventlogRepository implements Repository {

  private parentChildMap = {}
  private childParentMap = {}
  private readonly debouncedTreeRebuild = debounce(this.rebuildTreeStructureMaps.bind(this), 5000)

  constructor(readonly nodeEventLog: DEventLog<AddOrUpdateNodeEventPayload>,
              readonly nodeEventSource: DEventSource<AddOrUpdateNodeEventPayload>,
              readonly treeEventLog: DEventLog<ReparentNodeEventPayload>,
              readonly treeEventSource: DEventSource<ReparentNodeEventPayload>) {
    this.rebuildTreeStructureMaps().then(() => {
      // TODO: this is not great: we rebuild the maps, then subscribe and theoretically we could get
      // a bunch of events coming in forcing us to rebuild again. But using the debounced function above
      // would mean delaying the inital map construction for too long...
      nodeEventLog.subscribe({
        notify: this.nodeEventLogListener,
        filter: (event) => event.originator !== this.nodeEventLog.getId() })
      treeEventLog.subscribe({
        notify: this.treeEventLogListener,
        filter: (event) => event.originator !== this.nodeEventLog.getId() })
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
    return this.treeEventLog.getEventsSince(0).then(eventsResult => {
      const newParentChildMap = {}
      const newChildParentMap = {}
      eventsResult.events.forEach(event => {
        const nodeId = event.nodeId
        const parentId = event.payload.parentId
        const afterNodeId = event.payload.afterNodeId
        newChildParentMap[nodeId] = parentId
        this.insertNodeInParentChildMap(newParentChildMap, nodeId, parentId, afterNodeId)
      })
      // this is an attempt at an "atomic" update: we only replace the existing maps once we
      // have the new ones, to avoid having intermediate request accessing some weird state
      this.parentChildMap = newParentChildMap
      this.childParentMap = newChildParentMap
    })
  }

  // TODO: this should probably be a method of a dedicated class that models this parent child cache
  private insertNodeInParentChildMap(themap, nodeId: string, parentId: string, afterNodeId: string): void {
    let children = themap[parentId]
    if (!children) {
      children = [nodeId]
      themap[parentId] = children
    } else {
      let insertPos = 0
      let existingPos = -1
      for (let i = 0; i < children.length; i++) {
        if (children[i] === afterNodeId) {
          insertPos = i + 1
        } else if (children[i] === nodeId) {
          existingPos = i
        }
      }
      if (afterNodeId === END_NODELIST_MARKER) {
        insertPos = children.length
      }
      children.splice(insertPos, 0, nodeId)
      if (existingPos >= 0) {
        if (existingPos < insertPos) {
          children.splice(existingPos, 1)
        } else {
          // if the node was already present, but that location is the same or behind
          // the new position, then we need to make sure we also correct the existingPos
          // to account for the newly inserted node
          children.splice(existingPos + 1, 1)
        }
      }
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
      {name, note: node.content, deleted: !!node.deleted, collapsed: !!node.collapsed})
  }

  reparentNode(childId: string, parentId: string, position: RelativeNodePosition): Promise<void> {
    const afterNodeId = this.determineAfterNodeId(position)
    // if we have a local change (not a remote peer) then we can directly update the cache without rebuilding
    this.insertNodeInParentChildMap(this.parentChildMap, childId, parentId, afterNodeId)
    this.childParentMap[childId] = parentId
    return this.treeEventSource.publish(EventType.REPARENT_NODE, childId, {parentId, afterNodeId })
  }

  private determineAfterNodeId(position: RelativeNodePosition): string {
    if (position.beforeOrAfter === RelativeLinearPosition.BEGINNING) {
      return BEGINNING_NODELIST_MARKER
    } else if (position.beforeOrAfter === RelativeLinearPosition.AFTER) {
      return position.nodeId
    } else if (position.beforeOrAfter === RelativeLinearPosition.BEFORE) {
      // TODO: use child parent cache to determine position
      throw new Error(`Not implemented yet`)
    } else if (position.beforeOrAfter === RelativeLinearPosition.END) {
      return END_NODELIST_MARKER
    }
  }

  getChildIds(nodeId: string): Promise<string[]>
  getParentId(nodeId: string): Promise<string>
  loadNode(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<RepositoryNode>
  loadTree(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<LoadedTree>
}

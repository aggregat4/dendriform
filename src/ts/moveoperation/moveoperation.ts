import {
  RelativeNodePosition,
  RELATIVE_NODE_POSITION_UNCHANGED,
  Subscription,
} from '../domain/domain'
import { atomIdent } from '../lib/modules/logootsequence'
import { RepositoryNode } from '../repository/repository'
import { IdbLogMoveStorage, LogMoveRecord } from '../storage/idb-logmovestorage'
import { IdbReplicaStorage } from '../storage/idb-replicastorage'
import { IdbTreeStorage, ROOT_STORED_NODE, StoredNode } from '../storage/idb-treestorage'
import { assert, debounce } from '../utils/util'
import { MoveOp, NodeFlags, NodeMetadata, Replica } from './moveoperation-types'

class SubtreeChangedSubscription implements Subscription {
  constructor(
    readonly parentId: string,
    readonly listener: () => void,
    readonly cancelCallback: (subToCancel: Subscription) => void
  ) {}

  notify(): void {
    // An attempt at making sure we don't constantly call the notify method
    // for now we are happy to onyl get an update every 1s
    debounce(this.listener, 1000)
  }

  cancel(): void {
    this.cancelCallback(this)
  }
}

export class MoveOpTree {
  #nodeChangedSubscriptions: SubtreeChangedSubscription[] = []

  constructor(
    readonly replicaStore: IdbReplicaStorage,
    readonly logMoveStore: IdbLogMoveStorage,
    readonly treeStore: IdbTreeStorage
  ) {}

  private createMoveOp(node: RepositoryNode, parentId: string, logootPos?: atomIdent): MoveOp {
    const replicaId = this.replicaStore.getReplicaId()
    const clock = this.logMoveStore.getAndIncrementClock()
    return {
      nodeId: node.id,
      parentId: parentId,
      metadata: toNodeMetaData(node, logootPos),
      replicaId,
      clock,
    }
  }

  async createLocalNode(
    node: RepositoryNode,
    parentId: string,
    relativePosition: RelativeNodePosition
  ) {
    assert(
      relativePosition != RELATIVE_NODE_POSITION_UNCHANGED,
      'When creating a new node you must provide a relative position'
    )
    const replicaId = this.replicaStore.getReplicaId()
    const clock = this.logMoveStore.getAndIncrementClock()
    const nodeModification = await this.treeStore.storeNode(
      fromRepositoryNodeToStoredNode(node, parentId),
      {
        clock: clock,
        replicaId: replicaId,
        relativePosition,
      },
      (treeStorage: IdbTreeStorage, nodeId: string, parentId: string) => {
        if (!treeStorage.isNodeKnown(parentId)) {
          throw new Error(
            `When updating a node ${nodeId} we assume that the parent ${parentId} is known in our parent child map`
          )
        }
        if (treeStorage.isAncestorOf(nodeId, parentId)) {
          throw new Error(`Can't update a node to be a child of itself`)
        }
        return true
      }
    )
    if (nodeModification.modified) {
      const moveOp = {
        nodeId: node.id,
        parentId,
        metadata: toNodeMetaData(nodeModification.newNode, nodeModification.newNode.logootPos),
        replicaId,
        clock,
      }
      await this.recordMoveOp(moveOp)
    }
  }

  /**
   * This update operation will check whether the node already existed and if so
   * record the appropriate change event.
   */
  async updateLocalNode(
    nodeId: string,
    parentId: string,
    relativePosition: RelativeNodePosition,
    updateFun: (node: RepositoryNode) => boolean
  ) {
    await this.updateLocalNodeInternal(nodeId, parentId, relativePosition, updateFun)
  }

  private async updateLocalNodeInternal(
    nodeId: string,
    parentId: string,
    relativePosition: RelativeNodePosition,
    updateFun: (node: StoredNode) => boolean
  ) {
    assert(!!updateFun, `Require an update function in updateLocalNode`)
    const replicaId = this.replicaStore.getReplicaId()
    const clock = this.logMoveStore.getAndIncrementClock()
    const nodeModification = await this.treeStore.updateNode(
      nodeId,
      {
        clock: clock,
        replicaId: replicaId,
        relativePosition,
      },
      updateFun
    )
    if (nodeModification.modified) {
      const moveOp = {
        nodeId,
        parentId,
        metadata: toNodeMetaData(nodeModification.newNode, nodeModification.newNode.logootPos),
        replicaId,
        clock,
      }
      await this.recordMoveOp(
        moveOp,
        nodeModification.oldNode.parentId,
        toNodeMetaData(nodeModification.oldNode, nodeModification.oldNode.logootPos)
      )
    }
  }

  async reparentNode(nodeId: string, parentId: string, position: RelativeNodePosition) {
    await this.updateLocalNodeInternal(nodeId, parentId, position, (node) => {
      node.parentId = parentId
      return true
    })
  }

  private async recordUnappliedMoveOp(moveOp: MoveOp): Promise<void> {
    console.debug(`recordUnappliedMoveOp`)
    await this.logMoveStore.storeEvent({
      clock: moveOp.clock,
      replicaId: moveOp.replicaId,
      oldParentId: null,
      oldPayload: null,
      newParentId: moveOp.parentId,
      newPayload: moveOp.metadata,
      childId: moveOp.nodeId,
      applied: false,
    })
  }

  private async recordMoveOp(
    moveOp: MoveOp,
    oldParentId?: string,
    oldPayload?: NodeMetadata
  ): Promise<void> {
    await this.logMoveStore.storeEvent({
      clock: moveOp.clock,
      replicaId: moveOp.replicaId,
      oldParentId: oldParentId,
      oldPayload: oldPayload,
      newParentId: moveOp.parentId,
      newPayload: moveOp.metadata,
      childId: moveOp.nodeId,
      applied: true,
    })
  }

  private async updateMoveOp(
    moveOp: MoveOp,
    oldParentId: string,
    oldPayload: NodeMetadata
  ): Promise<void> {
    await this.logMoveStore.updateEvent({
      clock: moveOp.clock,
      replicaId: moveOp.replicaId,
      oldParentId: oldParentId,
      oldPayload: oldPayload,
      newParentId: moveOp.parentId,
      newPayload: moveOp.metadata,
      childId: moveOp.nodeId,
      applied: true,
    })
  }

  /**
   * This method implements move operations that come from a different replica.
   *
   * It performs the following:
   *
   * - For each operation in the logmovestorage that has a timestamp AFTER the
   *   current moveop, we undo it
   * - If the child is equal to or an ancestor of the new parent, then the
   *   operation is ignored
   * - We apply the new move operation
   * - We redo all the previously undone moveoperations and record new logmove records
   */
  async applyMoveOp(moveOp: MoveOp): Promise<void> {
    console.debug(
      `applyMoveOp on replica ${this.replicaStore.getReplicaId()} for moveop ${JSON.stringify(
        moveOp
      )}`
    )
    const undoneLogMoveOps = await this.logMoveStore.undoAllNewerLogmoveRecordsInReverse(
      moveOp.clock,
      moveOp.replicaId
    )
    for (const logMoveRecord of undoneLogMoveOps) {
      await this.undoLogMoveOp(logMoveRecord)
    }
    console.debug(`I have ${undoneLogMoveOps.length} logmoverecords that I undid and will redo`)
    // APPLY the new logmoveop
    await this.updateRemoteNode(moveOp)
    // REDO all the logmoveops, but with a proper moveOperation so we can check for cycles, etc.
    // This will also update the child parent maps and treestore.
    undoneLogMoveOps.reverse()
    for (const logMoveRecord of undoneLogMoveOps) {
      await this.updateRemoteNode({
        nodeId: logMoveRecord.childId,
        clock: logMoveRecord.clock,
        parentId: logMoveRecord.newParentId,
        replicaId: logMoveRecord.replicaId,
        metadata: logMoveRecord.newPayload,
      })
    }
    for (const subscription of this.#nodeChangedSubscriptions) {
      console.debug(`checking subscription to ${subscription.parentId}`)
      if (this.treeStore.isAncestorOf(subscription.parentId, moveOp.nodeId)) {
        console.debug(`Notifying subscriber of node change for parent ${subscription.parentId}`)
        subscription.notify()
      }
    }
  }

  private async undoLogMoveOp(logMoveOp: LogMoveRecord) {
    if (!logMoveOp.applied) {
      return
    }
    if (logMoveOp.oldParentId == null) {
      // the node was new, undoing just means deleting
      await this.treeStore.deleteNode(logMoveOp.childId)
    } else {
      // the node was not new but changed, undoing means restoring the old state (parent and payload)
      await this.treeStore.storeNode(
        {
          id: logMoveOp.childId,
          parentId: logMoveOp.oldParentId,
          name: logMoveOp.oldPayload.name,
          note: logMoveOp.oldPayload.note,
          collapsed: extractFlag(logMoveOp.oldPayload.flags, NodeFlags.collapsed),
          deleted: extractFlag(logMoveOp.oldPayload.flags, NodeFlags.deleted),
          completed: extractFlag(logMoveOp.oldPayload.flags, NodeFlags.completed),
          created: logMoveOp.oldPayload.created,
          updated: logMoveOp.oldPayload.updated,
          logootPos: logMoveOp.oldPayload.logootPos,
        },
        null,
        (treeStorage: IdbTreeStorage, nodeId: string, parentId: string) => {
          // TODO: I am unsure if this is the correct validation for undoLogMoveOp. Maybe we need to be more lenient here and silently skip some failures and just not update? Or not?
          if (!treeStorage.isNodeKnown(parentId)) {
            throw new Error(
              `When updating a node ${nodeId} we assume that the parent ${parentId} is known in our parent child map`
            )
          }
          if (treeStorage.isAncestorOf(nodeId, parentId)) {
            throw new Error(`Can't update a node to be a child of itself`)
          }
          return true
        }
      )
    }
  }

  /**
   * This update operation will check whether the node already existed and if so
   * record the appropriate change event.
   */
  private async updateRemoteNode(moveOp: MoveOp) {
    console.debug(
      `DEBUG: updateRemoteNode for ${JSON.stringify(
        moveOp
      )} on replica ${this.replicaStore.getReplicaId()}`
    )
    this.logMoveStore.updateWithExternalClock(moveOp.clock)
    // We always at least record the event, even if we cannot apply it right now
    // we may be able to apply it in the future once more events come in
    await this.recordUnappliedMoveOp(moveOp)
    // TODO: this is not in one transaction, maybe have to change this somehow, maybe it doesn't matter for external nodes?
    const oldNode = await this.treeStore.loadNode(moveOp.nodeId)
    const newNode = toStoredNode(moveOp)
    console.debug(
      `DEBUG: in updateRemoteNode, about to call storeNode with ${JSON.stringify(newNode)}`
    )
    // in case of missing parent nodes or potential cycles, we want to silently fail and continue: if the parent node is not known, we just don't store this but we recorded the moveop and we can try again when we get new moveops in the future (that may add this parent)
    const stored = await this.treeStore.storeNode(
      newNode,
      null,
      (treeStorage: IdbTreeStorage, nodeId: string, parentId: string) => {
        if (!treeStorage.isNodeKnown(parentId)) {
          return false
        }
        if (treeStorage.isAncestorOf(nodeId, parentId)) {
          return false
        }
        return true
      }
    )
    if (stored.modified) {
      if (oldNode != null) {
        console.debug(`We have an existing node with id ${moveOp.nodeId}`)
        await this.updateMoveOp(
          moveOp,
          oldNode.parentId,
          toNodeMetaData(oldNode, oldNode.logootPos)
        )
      } else {
        console.debug(`Inserting a new node with id ${moveOp.nodeId}`)
        await this.updateMoveOp(moveOp, null, null)
      }
    }
  }

  // for the pump
  async getLocalMoveOpsSince(clock: number, batchSize: number): Promise<MoveOp[]> {
    const replicaId = this.replicaStore.getReplicaId()
    const moveOps = await this.logMoveStore.getEventsForReplicaSince(replicaId, clock, batchSize)
    return moveOps.map((logMoveRecord) => {
      return {
        clock: logMoveRecord.clock,
        replicaId: logMoveRecord.replicaId,
        nodeId: logMoveRecord.childId,
        parentId: logMoveRecord.newParentId,
        metadata: logMoveRecord.newPayload,
      }
    })
  }

  /**
   * This method should also be used internally as it special cases the 'ROOT'
   * node and will always return a node for it.
   *
   * @param nodeId
   * @returns
   */
  async loadNode(nodeId: string): Promise<StoredNode> {
    if (nodeId == 'ROOT') {
      return ROOT_STORED_NODE
    } else {
      return await this.treeStore.loadNode(nodeId)
    }
  }

  getChildIds(nodeId: string): string[] {
    return this.treeStore.getChildIds(nodeId)
  }

  subscribeToSubtreeChanges(parentId: string, nodeChangeListener: () => void): Subscription {
    const subscription = new SubtreeChangedSubscription(
      parentId,
      nodeChangeListener,
      (subToCancel) => this.unsubscribe(subToCancel)
    )
    this.#nodeChangedSubscriptions.push(subscription)
    return subscription
  }

  private unsubscribe(subscription: Subscription): void {
    const subscriptionIndex = this.#nodeChangedSubscriptions.findIndex(
      (sub) => sub === subscription
    )
    if (subscriptionIndex >= 0) {
      this.#nodeChangedSubscriptions.splice(subscriptionIndex, 1)
    }
  }

  async getKnownReplicaSet(): Promise<Replica[]> {
    return await this.logMoveStore.getKnownReplicaSet()
  }

  /**
   * This method will accept a new state of the replicaset as seen by the server
   * and will update its internal state to reflect this. Specifically this can
   * trigger a GC of old events since we can use this replicaset to determine
   * the causal threshold.
   *
   * The causal threshold is the set of maximum clocks for each replica where we
   * know that we will never get an event older than those clocks in the future.
   * Events with smaller clocks can be safely discarded since they will never
   * need to be replayed again.
   *
   * @param replicaSet The new state of the replicaset as the sync server sees it.
   */
  processNewReplicaSet(replicaSet: Replica[]) {
    // TODO: implement this
  }
}

function toNodeMetaData(node: RepositoryNode, logootPos?: atomIdent): NodeMetadata {
  return {
    name: node.name,
    note: node.note,
    flags:
      (node.collapsed ? NodeFlags.collapsed : 0) |
      (node.deleted ? NodeFlags.deleted : 0) |
      (node.completed ? NodeFlags.completed : 0),
    created: node.created,
    updated: node.updated,
    logootPos: logootPos,
  }
}

function extractFlag(flags: number, flag: NodeFlags): boolean {
  return (flags & flag) == flag
}

function fromRepositoryNodeToStoredNode(node: RepositoryNode, parentId: string): StoredNode {
  return {
    id: node.id,
    parentId,
    name: node.name,
    note: node.note,
    created: node.created,
    updated: node.updated,
    logootPos: null,
    collapsed: node.collapsed,
    completed: node.completed,
    deleted: node.deleted,
  }
}

function toStoredNode(moveOp: MoveOp): StoredNode {
  return {
    id: moveOp.nodeId,
    parentId: moveOp.parentId,
    name: moveOp.metadata.name,
    note: moveOp.metadata.note,
    created: moveOp.metadata.created,
    updated: moveOp.metadata.updated,
    logootPos: moveOp.metadata.logootPos,
    collapsed: extractFlag(moveOp.metadata.flags, NodeFlags.collapsed),
    completed: extractFlag(moveOp.metadata.flags, NodeFlags.completed),
    deleted: extractFlag(moveOp.metadata.flags, NodeFlags.deleted),
  }
}

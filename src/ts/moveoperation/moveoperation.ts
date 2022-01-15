import {
  RelativeNodePosition,
  RELATIVE_NODE_POSITION_UNCHANGED,
  Subscription,
} from '../domain/domain'
import { NodeFlags, NodeMetadata } from '../eventlog/eventlog-domain'
import { atomIdent } from '../lib/modules/logootsequence'
import { RepositoryNode } from '../repository/repository'
import { IdbLogMoveStorage, LogMoveRecord } from '../storage/idb-logmovestorage'
import { IdbReplicaStorage } from '../storage/idb-replicastorage'
import { IdbTreeStorage, ROOT_STORED_NODE, StoredNode } from '../storage/idb-treestorage'
import { assert } from '../utils/util'

export interface MoveOp {
  nodeId: string
  parentId: string
  metadata: NodeMetadata
  replicaId: string
  clock: number
}

class SubtreeChangedSubscription implements Subscription {
  constructor(
    readonly parentId: string,
    readonly listener: () => void,
    readonly cancelCallback: (subToCancel: Subscription) => void
  ) {}

  notify(): void {
    this.listener()
  }

  cancel(): void {
    this.cancelCallback(this)
  }
}

// TODO: consider splitting oout a remote and local interface to differentiate
// between the use cases of communicating with other replicas or providing the
// information internally (MoveOpTree internally and ReplicaMoveOpTree externally?).
export class MoveOpTree {
  private nodeChangedSubscriptions: SubtreeChangedSubscription[] = []

  constructor(
    readonly replicaStore: IdbReplicaStorage,
    readonly logMoveStore: IdbLogMoveStorage,
    readonly treeStore: IdbTreeStorage
  ) {}

  /**
   * This update operation will check whether the node already existed and if so record the appropriate
   * change event.
   */
  async updateLocalNode(
    node: RepositoryNode,
    parentId: string,
    relativePosition: RelativeNodePosition
  ) {
    const replicaId = this.replicaStore.getReplicaId()
    const clock = this.replicaStore.getClock()
    if (!this.treeStore.isNodeKnown(parentId)) {
      throw new Error(
        'When updating a node we assume that the parent is known in our parent child map'
      )
    }
    // if the new node is equal to the parent or is an ancestor of the parent, we ignore the moveop
    // This prevents cycles
    if (this.treeStore.isAncestorOf(node.id, parentId)) {
      return
    }
    const moveOp = {
      nodeId: node.id,
      parentId: parentId,
      metadata: toNodeMetaData(node, null),
      replicaId,
      clock,
    }
    // we need to retrieve the current (or old) node so we can record the change from old to new
    const oldNode = await this.loadNode(node.id)
    if (!oldNode) {
      assert(
        relativePosition != RELATIVE_NODE_POSITION_UNCHANGED,
        'When creating a new node you must provide a relative position'
      )
    }
    // first we try to store the node: this performs a bunch of sanity checks, if they fail, we can prevent storing the moveop
    await this.treeStore.storeNode(toStoredNode(moveOp), {
      clock: moveOp.clock,
      replicaId: moveOp.replicaId,
      relativePosition,
    })
    if (oldNode) {
      await this.recordMoveOp(moveOp, oldNode.parentId, toNodeMetaData(oldNode, oldNode.logootPos))
    } else {
      await this.recordMoveOp(moveOp, null, null)
    }
    // TODO: remove clock storage bottleneck (this will also remove spurious clock updates if we reject operations because of cycles)
    await this.replicaStore.setClock(moveOp.clock + 1)
  }

  private async recordUnappliedMoveOp(moveOp: MoveOp): Promise<void> {
    await this.logMoveStore.storeEvents([
      {
        clock: moveOp.clock,
        replicaId: moveOp.replicaId,
        oldParentId: null,
        oldPayload: null,
        newParentId: moveOp.parentId,
        newPayload: moveOp.metadata,
        childId: moveOp.nodeId,
        applied: false,
      },
    ])
  }

  private async recordMoveOp(
    moveOp: MoveOp,
    oldParentId: string,
    oldPayload: NodeMetadata
  ): Promise<void> {
    await this.logMoveStore.storeEvents([
      {
        clock: moveOp.clock,
        replicaId: moveOp.replicaId,
        oldParentId: oldParentId,
        oldPayload: oldPayload,
        newParentId: moveOp.parentId,
        newPayload: moveOp.metadata,
        childId: moveOp.nodeId,
        applied: true,
      },
    ])
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
   * - for each operation in the logmovestorage that has a timestamp AFTER the current moveop, we undo it
   * - if the child is equal to or an ancestor of the new parent, then the operation is ignored
   * - we apply the new move operation
   * - we redo all the previously undone moveoperations and record new logmove records
   */
  async applyMoveOp(moveOp: MoveOp): Promise<void> {
    const undoneLogMoveOps = []
    // UNDO all the newer logmoveops
    await this.logMoveStore.undoAllNewerLogmoveRecordsInReverse(
      moveOp.clock,
      moveOp.replicaId,
      async (logMoveOp: LogMoveRecord) => {
        undoneLogMoveOps.push(logMoveOp)
        await this.undoLogMoveOp(logMoveOp)
      }
    )
    console.debug(`I have ${undoneLogMoveOps.length} logmoverecords that I undid and will redo`)
    // APPLY the new logmoveop
    await this.updateRemoteNode(moveOp)
    // REDO all the logmoveops, but with a proper moveOperation so we can check for cycles, etc.
    // This will also update the child parent maps and treestore.
    undoneLogMoveOps.reverse().map(async (logMoveOp: LogMoveRecord) => {
      await this.updateRemoteNode({
        nodeId: logMoveOp.childId,
        clock: logMoveOp.clock,
        parentId: logMoveOp.newParentId,
        replicaId: logMoveOp.replicaId,
        metadata: logMoveOp.newPayload,
      })
    })
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
        null
      )
    }
  }

  /**
   * This update operation will check whether the node already existed and if so record the appropriate
   * change event.
   */
  private async updateRemoteNode(moveOp: MoveOp) {
    const clock = this.replicaStore.getClock()
    // TODO: remove clock storage bottleneck (this will also remove spurious clock updates if we reject operations because of cycles)
    await this.replicaStore.setClock(Math.max(clock, moveOp.clock) + 1)
    // We always at least record the event, even if we cannot apply it right now
    // we may be able to apply it in the future once more events come in
    await this.recordUnappliedMoveOp(moveOp)
    if (!this.treeStore.isNodeKnown(moveOp.parentId)) {
      return
    }
    // if the new node is equal to the parent or is an ancestor of the parent, we ignore the moveop
    // This prevents cycles
    if (this.treeStore.isAncestorOf(moveOp.nodeId, moveOp.parentId)) {
      console.debug(
        `The new node ${moveOp.nodeId} is an ancestor f ${moveOp.parentId}, can not apply operation`
      )
      return
    }
    await this.treeStore.storeNode(toStoredNode(moveOp), null)
    // we need to retrieve the current (or old) node so we can record the change from old to new (if it exists)
    const oldNode = await this.loadNode(moveOp.nodeId)
    if (oldNode != null) {
      console.debug(`We have an existing node with id ${moveOp.nodeId}`)
      await this.updateMoveOp(moveOp, oldNode.parentId, toNodeMetaData(oldNode, oldNode.logootPos))
    } else {
      console.debug(`Inserting a new node with id ${moveOp.nodeId}`)
      await this.updateMoveOp(moveOp, null, null)
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
   * This method should also be used internally as it special cases the 'ROOT' node and will always return a node for it.
   * @param nodeId
   * @returns
   */
  async loadNode(nodeId: string): Promise<StoredNode> {
    if (nodeId == 'ROOT') {
      return ROOT_STORED_NODE
    } else {
      return this.treeStore.loadNode(nodeId)
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
    this.nodeChangedSubscriptions.push(subscription)
    return subscription
  }

  private unsubscribe(subscription: Subscription): void {
    const subscriptionIndex = this.nodeChangedSubscriptions.findIndex((sub) => sub === subscription)
    if (subscriptionIndex >= 0) {
      this.nodeChangedSubscriptions.splice(subscriptionIndex, 1)
    }
  }
}

function toNodeMetaData(node: RepositoryNode, logootPos: atomIdent): NodeMetadata {
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

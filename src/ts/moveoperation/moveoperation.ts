import {
  RelativeLinearPosition,
  RelativeNodePosition,
  RELATIVE_NODE_POSITION_UNCHANGED,
  Subscription,
} from '../domain/domain'
import { LifecycleAware } from '../domain/lifecycle'
import { NodeFlags, NodeMetadata } from '../eventlog/eventlog-domain'
import { atomIdent } from '../lib/modules/logootsequence'
import { LogootSequenceWrapper } from '../repository/logoot-sequence-wrapper'
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
export class MoveOpTree implements LifecycleAware {
  private nodeChangedSubscriptions: SubtreeChangedSubscription[] = []
  private parentChildMap: { [key: string]: LogootSequenceWrapper } = {}
  private childParentMap: { [key: string]: string } = {}

  constructor(
    readonly replicaStore: IdbReplicaStorage,
    readonly logMoveStore: IdbLogMoveStorage,
    readonly treeStore: IdbTreeStorage
  ) {}

  async init(): Promise<void> {
    this.initParentChildMap()
  }

  deinit(): Promise<void> {
    // noop
    return null
  }

  // TODO: consider moving all tree related logic into  IdTreeStorage and "just" expose RepositoryNodes from there (no StoredNodes and logootpos and all that jazz)
  private async initParentChildMap(): Promise<void> {
    const newParentChildMap = {}
    const newChildParentMap = {}
    // Special casing the ROOT node
    this.getOrCreateSeqForParent('ROOT', newParentChildMap)
    // iterate over all nodes in tree storage and add them to the tree
    for await (const node of this.treeStore.nodeGenerator()) {
      const parentSeq = this.getOrCreateSeqForParent(node.parentId, newParentChildMap)
      parentSeq.insertAtAtomIdent(node.id, node.logootPos)
      // we also need to create an empty sequence for the node itself if it does not already exist so we can query it later
      this.getOrCreateSeqForParent(node.id, newParentChildMap)
      newParentChildMap[node.id] = node.parentId
    }
    this.parentChildMap = newParentChildMap
    this.childParentMap = newChildParentMap
  }

  private getOrCreateSeqForParent(
    parentId: string,
    parentChildMap: { [key: string]: LogootSequenceWrapper }
  ): LogootSequenceWrapper {
    return parentChildMap[parentId] || (parentChildMap[parentId] = new LogootSequenceWrapper())
  }

  private getSeqForParent(
    parentId: string,
    parentChildMap: { [key: string]: LogootSequenceWrapper }
  ): LogootSequenceWrapper | null {
    return parentChildMap[parentId]
  }

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

    const clock = this.replicaStore.getClock() + 1
    // TODO: remove clock storage bottleneck (this will also remove spurious clock updates if we reject operations because of cycles)
    await this.replicaStore.setClock(clock)
    const newParentSeq = this.getSeqForParent(parentId, this.parentChildMap)
    assert(
      newParentSeq != null,
      'When updating a node we assume that the parent is known in our parent child map'
    )
    // if the referenced parent is unknown, we ignore this move op, it may be that we get the move op to create the parent sometime later
    if (newParentSeq == null) {
      return
    }
    // if the new node is equal to the parent or is an ancestor of the parent, we ignore the moveop
    // This prevents cycles
    if (isAncestorOf(node.id, parentId, this.childParentMap)) {
      return
    }
    // we need to retrieve the current (or old) node so we can record the change from old to new
    const oldNode = await this.loadNode(node.id)
    if (oldNode != null) {
      assert(
        !(oldNode.parentId != parentId && relativePosition == RELATIVE_NODE_POSITION_UNCHANGED),
        'When we claim that the position of the node is UNCHANGED, we can not be moving it between two different parents'
      )
      const oldParentSeq = this.getSeqForParent(oldNode.parentId, this.parentChildMap)
      assert(
        oldParentSeq != null,
        'When updating a node we assume that the old parent is known in our parent child map'
      )
      const oldLogootPos = oldParentSeq.getAtomIdentForItem(node.id)
      assert(
        oldLogootPos != null,
        'When a node is already in the tree it must also have a position'
      )
      if (relativePosition.beforeOrAfter != RelativeLinearPosition.UNCHANGED) {
        oldParentSeq.deleteAtAtomIdent(oldLogootPos)
      }
      const newLogootPos =
        relativePosition.beforeOrAfter != RelativeLinearPosition.UNCHANGED
          ? newParentSeq.insertElement(node.id, relativePosition, clock, replicaId)
          : oldLogootPos
      await this.updateExistingNode(oldNode, node, parentId, newLogootPos, clock, replicaId)
    } else {
      assert(
        relativePosition != RELATIVE_NODE_POSITION_UNCHANGED,
        'When creating a new node you must provide a relative position'
      )
      const newLogootPos = newParentSeq.insertElement(node.id, relativePosition, clock, replicaId)
      await this.createNewNode(node, parentId, newLogootPos, clock, replicaId)
    }
  }

  private async createNewNode(
    node: RepositoryNode,
    parentId: string,
    newLogootPos: atomIdent,
    clock: number,
    replicaId: string
  ) {
    const moveOp = {
      nodeId: node.id,
      parentId: parentId,
      metadata: toNodeMetaData(node, newLogootPos),
      replicaId,
      clock,
    }
    await this.recordMoveOp(moveOp, null, null)
  }

  private async updateExistingNode(
    oldNode: StoredNode,
    node: RepositoryNode,
    parentId: string,
    newLogootPos: atomIdent,
    clock: number,
    replicaId: string
  ) {
    const moveOp = {
      nodeId: node.id,
      parentId: parentId,
      metadata: toNodeMetaData(node, newLogootPos),
      replicaId,
      clock,
    }
    await this.recordMoveOp(moveOp, oldNode.parentId, toNodeMetaData(oldNode, oldNode.logootPos))
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
      },
    ])
    await this.treeStore.storeNode(toStoredNode(moveOp))
    // TODO: consider moving tree caching and sequence management to the TreeStore?
    // in case we create a new node we also need to make an empty logootsequence
    this.getOrCreateSeqForParent(moveOp.nodeId, this.parentChildMap)
    this.childParentMap[moveOp.nodeId] = moveOp.parentId
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
    if (logMoveOp.oldParentId == null) {
      // the node was new, undoing just means deleting
      await this.treeStore.deleteNode(logMoveOp.childId)
      delete this.childParentMap[logMoveOp.childId]
      // We assume that this node will have no children (because it was new) so we can safely remove it from the parentChildMap without ophaning children
      const parentSeq = this.getSeqForParent(logMoveOp.newParentId, this.parentChildMap)
      parentSeq.deleteAtAtomIdent(logMoveOp.newPayload.logootPos)
      // TODO: test this removal logic! Do I have all the loose ends?
      delete this.parentChildMap[logMoveOp.childId]
    } else {
      // the node was not new but changed, undoing means restoring the old state (parent and payload)
      await this.treeStore.storeNode({
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
      })
      this.childParentMap[logMoveOp.childId] = logMoveOp.oldParentId
      const oldParentSeq = this.getSeqForParent(logMoveOp.oldParentId, this.parentChildMap)
      assert(
        oldParentSeq != null,
        `When undoing a logmove operation of an existing node (with an old and new payload) we assume that the node's old parent exists`
      )
      const newParentSeq = this.getSeqForParent(logMoveOp.newParentId, this.parentChildMap)
      assert(
        newParentSeq != null,
        `When undoing a logmove operation of an existing node (with an old and new payload) we assume that the node's new parent exists`
      )
      newParentSeq.deleteAtAtomIdent(logMoveOp.newPayload.logootPos)
      oldParentSeq.insertAtAtomIdent(logMoveOp.childId, logMoveOp.oldPayload.logootPos)
    }
  }

  /**
   * This update operation will check whether the node already existed and if so record the appropriate
   * change event.
   */
  private async updateRemoteNode(moveOp: MoveOp) {
    const clock = this.replicaStore.getClock() + 1
    // TODO: remove clock storage bottleneck (this will also remove spurious clock updates if we reject operations because of cycles)
    await this.replicaStore.setClock(clock)
    const newParentSeq = this.getSeqForParent(moveOp.parentId, this.parentChildMap)
    // if the referenced parent is unknown, we ignore this move op, it may be that we get the move op to create the parent sometime later
    if (newParentSeq == null) {
      console.debug(
        `Referenced parent ${moveOp.parentId} is unknown so we are ignore the moveOp entirely`
      )
      return
    }
    // if the new node is equal to the parent or is an ancestor of the parent, we ignore the moveop
    // This prevents cycles
    if (isAncestorOf(moveOp.nodeId, moveOp.parentId, this.childParentMap)) {
      console.debug(
        `The new node ${moveOp.nodeId} is an ancestor f ${moveOp.parentId}, can not apply operation`
      )
      return
    }
    // we need to retrieve the current (or old) node so we can record the change from old to new (if it exists)
    const oldNode = await this.loadNode(moveOp.nodeId)
    if (oldNode != null) {
      const oldParentSeq = this.getSeqForParent(oldNode.parentId, this.parentChildMap)
      assert(
        oldParentSeq != null,
        'When updating a node we assume that the old parent is known in our parent child map'
      )
      const oldLogootPos = oldParentSeq.getAtomIdentForItem(moveOp.nodeId)
      assert(
        oldLogootPos != null,
        'When a node is already in the tree it must also have a position'
      )
      if (moveOp.parentId != oldNode.parentId) {
        oldParentSeq.deleteAtAtomIdent(oldLogootPos)
      }
      await this.updateExistingNode(
        oldNode,
        toStoredNode(moveOp),
        moveOp.parentId,
        moveOp.metadata.logootPos,
        clock,
        moveOp.replicaId
      )
    } else {
      newParentSeq.insertAtAtomIdent(moveOp.nodeId, moveOp.metadata.logootPos)
      await this.createNewNode(
        toStoredNode(moveOp),
        moveOp.parentId,
        moveOp.metadata.logootPos,
        clock,
        moveOp.replicaId
      )
    }
  }

  // for the pump
  async getMoveOpsSince(replicaId: string, clock: number): Promise<MoveOp[]> {
    throw new Error('Method not implemented.')
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

  /**
   * Returns the children of the current node from our cache.
   * @returns The array of children. In case the node is not known in our cache an empty list is returned.
   *          The caller is responsible for verifying whether the node actually exists.
   */
  getChildIds(nodeId: string): string[] {
    const children = this.parentChildMap[nodeId]
    if (children) {
      return children.toArray()
    } else {
      return []
    }
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

function isAncestorOf(
  nodeId: string,
  parentId: string,
  childParentMap: { [key: string]: string }
): boolean {
  if (parentId == nodeId) {
    return true
  } else {
    const grandParentId = childParentMap[parentId]
    if (grandParentId != null) {
      return isAncestorOf(nodeId, grandParentId, childParentMap)
    } else {
      return false
    }
  }
}

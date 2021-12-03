import { CompleteNodeByIdCommandPayload } from '../commands/commands'
import {
  RelativeLinearPosition,
  RelativeNodePosition,
  RELATIVE_NODE_POSITION_END,
  Subscription,
} from '../domain/domain'
import { LifecycleAware } from '../domain/lifecycle'
import { NodeFlags, NodeMetadata } from '../eventlog/eventlog-domain'
import { atom, atomIdent } from '../lib/modules/logootsequence'
import { LogootSequenceWrapper } from '../repository/logoot-sequence-wrapper'
import { RepositoryNode } from '../repository/repository'
import { IdbLogMoveStorage } from '../storage/idb-logmovestorage'
import { IdbReplicaStorage } from '../storage/idb-replicastorage'
import { IdbTreeStorage, StoredNode } from '../storage/idb-treestorage'
import { secondsSinceEpoch } from '../utils/dateandtime'
import { assert } from '../utils/util'

export interface LocalMoveOp {
  nodeId: string
  parentId: string
  metadata: NodeMetadata
}

export interface ReplicaMoveOp extends LocalMoveOp {
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
    // iterate over all nodes in tree storage and add them to the tree
    for await (const node of this.treeStore.nodeGenerator()) {
      const childSeq = this.getOrCreateSeqForParent(node.parentId, newParentChildMap)
      childSeq.insertAtAtomIdent(node.id, node.logootPos)
    }
    this.parentChildMap = newParentChildMap
  }

  private getOrCreateSeqForParent(
    parentId: string,
    parentChildMap: { [key: string]: LogootSequenceWrapper }
  ): LogootSequenceWrapper {
    return parentChildMap[parentId] || (parentChildMap[parentId] = new LogootSequenceWrapper())
  }

  // private getOrCreatePositionForChild(nodeId: string, parentId: string, replicaId: string): atomIdent {
  //   const seq: LogootSequenceWrapper = this.getOrCreateSeqForParent(
  //     parentId,
  //     this.parentChildMap
  //   )
  //   const currentPosition = seq.getAtomIdentForItem(nodeId)
  //   if (!currentPosition) {
  //     return this.determineNewPositionForChild(nodeId, parentId, RELATIVE_NODE_POSITION_END, replicaId)
  //   } else {
  //     return currentPosition
  //   }
  // }

  // for local updates where we can fill in the local replica and counter
  // local updates are special as we do not need to undo any move operations (right?)
  // since we are single threaded and our clock is at max
  private async recordLocalMoveOp(
    moveOp: LocalMoveOp,
    oldParentId: string,
    oldPayload: NodeMetadata,
    clock: number
  ): Promise<void> {
    this.logMoveStore.storeEvents([
      {
        clock: clock,
        replicaId: this.replicaStore.getReplicaId(),
        oldParentId: oldParentId,
        oldPayload: oldPayload,
        newParentId: moveOp.parentId,
        newPayload: moveOp.metadata,
        childId: moveOp.nodeId,
      },
    ])
    await this.treeStore.storeNode(toStoredNode(moveOp))
  }

  /**
   * Only updates the node itself, not the parent and not the position in the parent child list.
   */
  async updateNode(node: RepositoryNode, parentId: string, relativePosition: RelativeNodePosition) {
    const clock = this.replicaStore.getClock() + 1
    // TODO: remove clock storage bottleneck
    await this.replicaStore.setClock(clock)
    const seq = this.getOrCreateSeqForParent(parentId, this.parentChildMap)
    assert(
      seq !== null,
      'When updating a node we assume that the parent is known in our parent child map'
    )
    const oldLogootPos = seq.getAtomIdentForItem(node.id)
    assert(
      !(oldLogootPos == null && relativePosition.beforeOrAfter == RelativeLinearPosition.UNCHANGED),
      'If we are claiming that the position of a node among its siblings is unchanged, it should at least exist among those siblings'
    )
    if (
      oldLogootPos != null &&
      relativePosition.beforeOrAfter != RelativeLinearPosition.UNCHANGED
    ) {
      seq.deleteAtAtomIdent(oldLogootPos)
    }
    const logootPos =
      relativePosition.beforeOrAfter != RelativeLinearPosition.UNCHANGED
        ? seq.insertElement(node.id, relativePosition, clock, this.replicaStore.getReplicaId())
        : oldLogootPos
    const localMoveOp = {
      nodeId: node.id,
      parentId: parentId,
      metadata: toNodeMetaData(node, logootPos),
    }
    const oldNode = await this.treeStore.loadNode(node.id)
    if (oldNode) {
      await this.recordLocalMoveOp(
        localMoveOp,
        oldNode.parentId,
        toNodeMetaData(oldNode, oldNode.logootPos),
        clock
      )
    } else {
      await this.recordLocalMoveOp(localMoveOp, null, null, clock)
    }
  }

  // for remote updates where we have full events coming in
  async recordReplicaMoveOp(moveOp: ReplicaMoveOp): Promise<void> {
    throw new Error('Method not implemented.')
  }

  // for the pump
  async getReplicaMoveOpsSince(replicaId: string, clock: number): Promise<ReplicaMoveOp[]> {
    throw new Error('Method not implemented.')
  }

  async loadNode(nodeId: string): Promise<StoredNode> {
    return this.treeStore.loadNode(nodeId)
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

function toStoredNode(moveOp: LocalMoveOp): StoredNode {
  return {
    id: moveOp.nodeId,
    parentId: moveOp.parentId,
    name: moveOp.metadata.name,
    note: moveOp.metadata.note,
    created: moveOp.metadata.created,
    updated: moveOp.metadata.updated,
    logootPos: moveOp.metadata.logootPos,
    collapsed: (moveOp.metadata.flags & NodeFlags.collapsed) == NodeFlags.collapsed,
    completed: (moveOp.metadata.flags & NodeFlags.completed) == NodeFlags.completed,
    deleted: (moveOp.metadata.flags & NodeFlags.deleted) == NodeFlags.deleted,
  }
}

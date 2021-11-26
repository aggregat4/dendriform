import { RelativeNodePosition, RELATIVE_NODE_POSITION_END, Subscription } from '../domain/domain'
import { LifecycleAware } from '../domain/lifecycle'
import { NodeMetadata } from '../eventlog/eventlog-domain'
import { atomIdent } from '../lib/modules/logootsequence'
import { LogootSequenceWrapper } from '../repository/logoot-sequence-wrapper'
import { IdbLogMoveStorage } from '../storage/idb-logmovestorage'
import { IdbReplicaStorage } from '../storage/idb-replicastorage'
import { IdbTreeStorage, StoredNode } from '../storage/idb-treestorage'
import { secondsSinceEpoch } from '../utils/dateandtime'

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

  deinit(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async createNewNode(
    id: string,
    parentId: string,
    name: string,
    note: string,
    relativePosition: RelativeNodePosition
  ): Promise<void> {
    const seq = this.getOrCreateSeqForParent(parentId, this.parentChildMap)
    const logootPos = seq.insertElement(
      id,
      relativePosition,
      this.replicaStore.getClock(),
      this.replicaStore.getReplicaId()
    )
    await this.recordLocalMoveOp({
      nodeId: id,
      parentId: parentId,
      metadata: {
        name: name,
        note: note,
        flags: 0, // three time false
        created: secondsSinceEpoch(),
        updated: secondsSinceEpoch(),
        logootPos: logootPos,
      },
    })
  }

  // for local updates where we can fill in the local replica and counter
  // local updates are special as we do not need to undo any move operations (right?)
  // since we are single threaded and our clock is at max
  private async recordLocalMoveOp(moveOp: LocalMoveOp): Promise<void> {
    const clock = this.replicaStore.getClock() + 1
    // TODO: remove clock storage bottleneck
    this.replicaStore.setClock(clock)
    this.logMoveStore.storeEvents([
      {
        clock: clock,
        replicaId: this.replicaStore.getReplicaId(),
        oldParentId: null,
        oldPayload: null,
        newParentId: moveOp.parentId,
        newPayload: moveOp.metadata,
        childId: moveOp.nodeId,
      },
    ])
  }

  // for remote updates where we have full events coming in
  async recordReplicaMoveOp(moveOp: ReplicaMoveOp): Promise<void> {}

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

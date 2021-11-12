import { RelativeNodePosition } from '../domain/domain'
import { LifecycleAware, Subscription } from '../domain/lifecycle'
import { DEvent, DEventLog } from '../eventlog/eventlog-domain'
import { IdbTreeStorage } from '../storage/idb-treestorage'
import { Predicate } from '../utils/util'
import { LoadedTree, Repository, RepositoryNode } from './repository'

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

// TODO: most of the real implementation (also subscribe to eventlog to update treeStorageStructure and notify subscribers)
export class LogAndTreeStorageRepository implements Repository, LifecycleAware {
  private changeSubscriptions: NodeChangedSubscription[] = []
  private eventLogSubscription: Subscription = null

  constructor(readonly treeStorage: IdbTreeStorage, readonly eventLog: DEventLog) {}

  async init(): Promise<void> {
    this.eventLogSubscription = this.eventLog.subscribe({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      notify: this.eventLogListener.bind(this),
      // TODO: verify whether we even want to differentiate between event originators , more generic would be not to but perhaps we can do some optimasation when treat local events differently
      filter: (event) => event.originator !== this.eventLog.getPeerId(),
    })
  }

  private eventLogListener(events: DEvent[]): void {
    // TODO: implement
  }

  async deinit(): Promise<void> {
    if (this.eventLogSubscription) {
      this.eventLogSubscription.cancel()
      this.eventLogSubscription = null
    }
  }

  async loadNode(nodeId: string, nodeFilter: Predicate<RepositoryNode>): Promise<RepositoryNode> {
    const node = await this.treeStorage.getNode(nodeId)
    if (nodeFilter(node)) {
      return node
    } else {
      return null
    }
  }

  async createNode(
    id: string,
    parentId: string,
    name: string,
    content: string,
    synchronous: boolean,
    relativePosition: RelativeNodePosition
  ): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async updateNode(node: RepositoryNode, parentId: string, synchronous: boolean): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async reparentNode(
    node: RepositoryNode,
    parentId: string,
    position: RelativeNodePosition,
    synchronous: boolean
  ): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async getChildIds(nodeId: string): Promise<string[]> {
    throw new Error('Method not implemented.')
  }

  async getParentId(nodeId: string): Promise<string> {
    return await this.treeStorage.getParent(nodeId)
  }

  async loadTree(
    nodeId: string,
    nodeFilter: Predicate<RepositoryNode>,
    loadCollapsedChildren: boolean
  ): Promise<LoadedTree> {
    throw new Error('Method not implemented.')
  }

  subscribeToChanges(
    parentNodeId: string,
    nodeChangeListener: (nodeId: string) => void
  ): Subscription {
    const subscription = new NodeChangedSubscription(
      parentNodeId,
      nodeChangeListener,
      (subToCancel) => this.unsubscribe(subToCancel)
    )
    this.changeSubscriptions.push(subscription)
    return subscription
  }

  private unsubscribe(subscription: Subscription): void {
    const subscriptionIndex = this.changeSubscriptions.findIndex((sub) => sub === subscription)
    if (subscriptionIndex >= 0) {
      this.changeSubscriptions.splice(subscriptionIndex, 1)
    }
  }
}

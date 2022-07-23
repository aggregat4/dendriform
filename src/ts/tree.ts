/*
 * This file wires everything together for the dendriform tree.
 */
import { TreeServiceCommandHandler } from './commands/command-handler-tree-service'
import { UndoableCommandHandler } from './commands/command-handler-undoable'
import { deinitAll, initAll, LifecycleAware, register } from './domain/lifecycle'
import { MoveOpTree } from './moveoperation/moveoperation'
import { JoinProtocol } from './replicaset/join-protocol'
import { SyncProtocol } from './replicaset/sync-protocol'
import { SyncProtocolHttpClient } from './replicaset/sync-protocol-client-http'
import { LogAndTreeStorageRepository } from './repository/repository-logandtreestorage'
import { TreeService } from './service/tree-service'
import { IdbDocumentSyncStorage } from './storage/idb-documentsyncstorage'
import { IdbLogMoveStorage } from './storage/idb-logmovestorage'
import { IdbReplicaStorage } from './storage/idb-replicastorage'
import { IdbTreeStorage } from './storage/idb-treestorage'
import { registerTreeActions, TreeActionRegistry } from './view/tree-actionregistry'
import { Tree } from './view/tree-component'

customElements.define('dendriform-tree', Tree)

export class TreeManager {
  private currentTree: Tree = null
  private initializables: LifecycleAware[] = []

  private async createAndInitTree(treeName: string): Promise<Tree> {
    await deinitAll(this.initializables)
    this.initializables = []

    const replicaStore = register(
      new IdbReplicaStorage(`${treeName}-replicastorage`),
      this.initializables
    )

    const idbDocumentSyncStorage = register(
      new IdbDocumentSyncStorage(`${treeName}-documentsyncstorage`),
      this.initializables
    )

    const client = new SyncProtocolHttpClient(`/`)

    const joinProtocol = register(
      new JoinProtocol(idbDocumentSyncStorage, treeName, replicaStore, client),
      this.initializables
    )

    const logMoveStore = register(
      new IdbLogMoveStorage(`${treeName}-logmovestorage`, joinProtocol),
      this.initializables
    )
    const treeStore = register(new IdbTreeStorage(`${treeName}-treestorage`), this.initializables)
    const moveOpTree = register(
      new MoveOpTree(replicaStore, logMoveStore, treeStore),
      this.initializables
    )
    // The sync protocol is itself not used by anything, it just needs to run
    register(
      new SyncProtocol(
        idbDocumentSyncStorage,
        joinProtocol,
        treeName,
        moveOpTree,
        client,
        replicaStore
      ),
      this.initializables
    )

    const repository = register(new LogAndTreeStorageRepository(moveOpTree), this.initializables)
    const treeService = register(new TreeService(repository), this.initializables)
    const treeServiceCommandHandler = register(
      new TreeServiceCommandHandler(treeService),
      this.initializables
    )
    const commandHandler = register(
      new UndoableCommandHandler(treeServiceCommandHandler),
      this.initializables
    )
    const treeActionRegistry = register(new TreeActionRegistry(), this.initializables)
    registerTreeActions(treeActionRegistry)
    const tree = register(
      new Tree(commandHandler, treeActionRegistry, treeService, joinProtocol),
      this.initializables
    )
    await initAll(this.initializables)
    return tree
  }

  async loadNode(nodeId: string): Promise<void> {
    await this.currentTree?.loadNode(nodeId)
  }

  /**
   * Initialises the tree with the given name and mounts it to the given DOM
   * element. It will deinitialise any previously initialised tree.
   *
   * Make sure to call mountTree only when DOMContentLoaded.
   *
   * @param el The element to mount the tree component to.
   */
  async mountTree(el: HTMLElement, treeName: string): Promise<void> {
    this.currentTree = await this.createAndInitTree(treeName)
    this.currentTree.mount()
    el.appendChild(this.currentTree)
  }
}

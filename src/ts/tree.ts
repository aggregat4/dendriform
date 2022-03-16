/*
 * This file wires everything together for the dendriform tree.
 */
import { Tree } from './view/tree-component'
import { deinitAll, initAll, LifecycleAware, register } from './domain/lifecycle'
import { TreeServiceCommandHandler } from './commands/command-handler-tree-service'
import { UndoableCommandHandler } from './commands/command-handler-undoable'
import { registerTreeActions, TreeActionRegistry } from './view/tree-actionregistry'
import { TreeService } from './service/tree-service'
import { LogAndTreeStorageRepository } from './repository/repository-logandtreestorage'
import { MoveOpTree } from './moveoperation/moveoperation'
import { IdbTreeStorage } from './storage/idb-treestorage'
import { IdbLogMoveStorage } from './storage/idb-logmovestorage'
import { IdbReplicaStorage } from './storage/idb-replicastorage'
import { JoinProtocol } from './replicaset/join-protocol'
import { JoinProtocolHttpClient } from './replicaset/join-protocol-client-http'
import { IdbDocumentSyncStorage } from './storage/idb-documentsyncstorage'

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

    const joinProtocol = register(
      new JoinProtocol(
        idbDocumentSyncStorage,
        treeName,
        replicaStore,
        new JoinProtocolHttpClient(`/`)
      ),
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

  getAvailableTrees(): Promise<string[]> {
    // TODO: try to get available trees from the server and in the fallback case
    // at least return the default base tree that is always there (?? Maybe? or
    // rather find out which ones we have locally? this would mean having a table
    // with all trees locally as well and initialising that if it is empty with the
    // default tree)
    return Promise.resolve(['dendriform-eventlog'])
  }
}

/*
 * This file wires everything together for the dendriform tree.
 */
import { Tree } from './view/tree-component'
import { deinitAll, isLifecycleAware, LifecycleAware } from './domain/lifecycle'

customElements.define('dendriform-tree', Tree)

export class TreeManager {
  private currentInitializer: Promise<Tree>
  private initializables: LifecycleAware[] = []

  private async createAndInitTree(treeName: string): Promise<Tree> {
    if (this.currentInitializer !== null) {
      await deinitAll(this.initializables)
      this.currentInitializer = null
    }
    // const idbEventRepository = this.register(new IdbEventRepository(treeName))
    // const peerIdMapper = this.register(new LocalEventLogIdMapper(treeName + '-peerid-mapping'))
    // const localEventLog = this.register(new LocalEventLog(idbEventRepository, peerIdMapper))
    // this.register(new LocalEventLogGarbageCollector(idbEventRepository))
    // const remoteEventLog = this.register(new RemoteEventLog('/', treeName))
    // const repository = this.register(new EventlogRepository(localEventLog))
    // const treeService = this.register(new TreeService(repository))
    // const treeServiceCommandHandler = this.register(new TreeServiceCommandHandler(treeService))
    // const commandHandler = this.register(new UndoableCommandHandler(treeServiceCommandHandler))
    // const treeActionRegistry = this.register(new TreeActionRegistry())
    // registerTreeActions(treeActionRegistry)
    // const tree = this.register(
    //   new Tree(commandHandler, treeService, treeActionRegistry, localEventLog)
    // )
    // // tree.commandHandler = commandHandler
    // // tree.treeService = treeService
    // // tree.treeActionRegistry = treeActionRegistry
    // // tree.activityIndicating = localEventLog
    // this.register(new EventPump(localEventLog, remoteEventLog, localEventLog.getPeerId()))
    // await this.initAll()
    // return tree
    return null
  }

  async loadNode(nodeId: string): Promise<void> {
    if (this.currentInitializer !== null) {
      await this.currentInitializer.then((tree) => tree.loadNode(nodeId))
    }
  }

  /**
   * Initialises the tree with the given name and mounts it to the given
   * DOM element. It will deinitialise any previously initialised tree.
   *
   * Make sure to call mountTree only when DOMContentLoaded.
   *
   * @param el The element to mount the tree component to.
   */
  async mountTree(el: HTMLElement, treeName: string): Promise<void> {
    this.currentInitializer = this.createAndInitTree(treeName).then((tree) => {
      tree.mount()
      return el.appendChild(tree)
    })
    await this.currentInitializer
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

/*
 * This file wires everything together for the dendriform tree.
 */
import { TreeService } from './service/tree-service'
import { TreeServiceCommandHandler } from './commands/command-handler-tree-service'
import { UndoableCommandHandler } from './commands/command-handler-undoable'
import { Tree } from './view/tree-component'
import { EventlogRepository } from './repository/repository-eventlog'
import { LocalEventLog } from './eventlog/eventlog-indexeddb'
import { RemoteEventLog } from './remote/eventlog-remote'
import { EventPump } from './remote/eventpump'
import { TreeActionRegistry, registerTreeActions } from './view/tree-actionregistry'

customElements.define('dendriform-tree', Tree)

export class TreeManager {
  private currentEventPump: EventPump = null
  private currentInitializer: Promise<Tree>

  private async createAndInitTree(treeName: string): Promise<Tree> {
    if (this.currentEventPump !== null) {
      await this.currentEventPump.deinit()
      this.currentEventPump = null
      const oldTree = await this.currentInitializer
      await oldTree.deinit()
      this.currentInitializer = null
    }
    const localEventLog = new LocalEventLog(treeName)
    const remoteEventLog = new RemoteEventLog('/', treeName)
    this.currentEventPump = new EventPump(localEventLog, remoteEventLog)
    const repository = new EventlogRepository(localEventLog)
    const treeService = new TreeService(repository)
    const treeServiceCommandHandler = new TreeServiceCommandHandler(treeService)
    const commandHandler = new UndoableCommandHandler(treeServiceCommandHandler)
    const treeActionRegistry = new TreeActionRegistry()
    registerTreeActions(treeActionRegistry)
    const tree = new Tree()
    tree.commandHandler = commandHandler
    tree.treeService = treeService
    tree.treeActionRegistry = treeActionRegistry
    tree.activityIndicating = localEventLog
    await tree.init()
    await this.currentEventPump.init()
    return tree
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
    this.currentInitializer = this.createAndInitTree(treeName).then((tree) => el.appendChild(tree))
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

/*
 * This file wires everything together for the dendriform tree.
 */
import { mount } from 'redom'
import { TreeService } from './service/tree-service'
import { TreeServiceCommandHandler } from './commands/command-handler-tree-service'
import { UndoableCommandHandler } from './commands/command-handler-undoable'
import { Tree } from './view/tree-component'
import { EventlogRepository } from './repository/repository-eventlog'
import { LocalEventLog } from './eventlog/eventlog-indexeddb'
import { RemoteEventLog } from './remote/eventlog-remote'
import { EventPump } from './remote/eventpump'
import { TreeActionRegistry, registerTreeActions } from './view/tree-actionregistry'
// DOM initialisation functions that require the mounted DOM node
import { init as opmlInit } from './view/action-opmlimport'

async function initTree(treeName: string): Promise<Tree> {
  const localEventLog = new LocalEventLog(treeName)
  const remoteEventLog = new RemoteEventLog('/', treeName)
  const eventPump = new EventPump(localEventLog, remoteEventLog)
  const repository = new EventlogRepository(localEventLog)
  const treeService = new TreeService(repository)
  const treeServiceCommandHandler = new TreeServiceCommandHandler(treeService)
  const commandHandler = new UndoableCommandHandler(treeServiceCommandHandler)
  const treeActionRegistry = new TreeActionRegistry()
  registerTreeActions(treeActionRegistry)
  return localEventLog.init()
    .then(() => eventPump.init())
    .then(() => eventPump.start())
    .then(() => repository.init())
    .then(() => new Tree(commandHandler, treeService, treeActionRegistry, localEventLog))
}

const initPromise = initTree('dendriform-eventlog')

export function updateTree(nodeId: string) {
  initPromise.then((tree) => tree.loadNode(nodeId))
}

/**
 * Make sure to call mountTree only when DOMContentLoaded.
 * @param el The element to mount the tree component to.
 */
export function mountTree(el: HTMLElement): void {
  initPromise.then((tree) => {
    mount(el, tree)
    opmlInit(tree.getTreeElement())
  })
}

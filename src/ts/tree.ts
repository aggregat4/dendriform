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
import { waitForThen } from './utils/util'
// DOM initialisation functions that require the mounted DOM node
import { init as opmlInit } from './view/action-opmlimport'

const localEventLog = new LocalEventLog('dendriform-eventlog')
const remoteEventLog = new RemoteEventLog('/', 'dendriform-eventlog')
const eventPump = new EventPump(localEventLog, remoteEventLog)
const repository = new EventlogRepository(localEventLog)
const treeService = new TreeService(repository)

const treeServiceCommandHandler = new TreeServiceCommandHandler(treeService)
const commandHandler = new UndoableCommandHandler(treeServiceCommandHandler)
const treeActionRegistry = new TreeActionRegistry()
registerTreeActions(treeActionRegistry)
const tree = new Tree(commandHandler, treeService, treeActionRegistry, localEventLog)

const initPromise = localEventLog.init()
  .then(() => eventPump.init())
  .then(() => eventPump.start())
  .then(() => repository.init())

export function updateTree(nodeId: string) {
  waitForThen(
    () => eventPump.hasTriedToContactServerOnce(),
    () => initPromise.then(() => tree.loadNode(nodeId)),
    20)
}

/**
 * Make sure to call mountTree only when DOMContentLoaded.
 * @param el The element to mount the tree component to.
 */
export function mountTree(el: HTMLElement): void {
  initPromise.then(() => {
    mount(el, tree)
    opmlInit(tree.getTreeElement())
  })
}

import {mount} from 'redom'
import {TreeService} from './service/tree-service'
import {TreeServiceCommandHandler} from './commands/command-handler-tree-service'
import {UndoableCommandHandler} from './commands/command-handler-undoable'
import {Tree} from './view/tree-component'
import {EventlogRepository} from './repository/repository-eventlog'
import {LocalEventLog} from './eventlog/eventlog-local'
import {RemoteEventLog } from './remote/eventlog-remote'
import {EventPump } from './remote/eventpump'

/*
 * This file wires everything together for the dendriform tree.
 */

const localEventLog = new LocalEventLog('dendriform-eventlog')
const remoteEventLog = new RemoteEventLog('/', 'dendriform-eventlog')

const eventPump = new EventPump(localEventLog, remoteEventLog)

const treePromise = localEventLog.init()
  .then(() => eventPump.init()).then(() => eventPump.start())
  .then(() => new EventlogRepository(localEventLog).init())
  .then(repository => {
    const treeService = new TreeService(repository)
    const commandHandler = new UndoableCommandHandler(new TreeServiceCommandHandler(treeService))
    return new Tree(commandHandler, treeService)
  })

export function updateTree(nodeId: string) {
  treePromise.then(tree => tree.loadNode(nodeId))
}

/**
 * Make sure to call mountTree only when DOMContentLoaded.
 * @param el The element to mount the tree component to.
 */
export function mountTree(el: Element): void {
  treePromise.then(tree => mount(el, tree))
}

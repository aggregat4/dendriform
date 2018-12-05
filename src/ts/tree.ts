import {mount} from 'redom'
import {TreeService} from './service/tree-service'
import {TreeServiceCommandHandler} from './commands/command-handler-tree-service'
import {UndoableCommandHandler} from './commands/command-handler-undoable'
import {Tree} from './view/tree-component'
import {EventlogRepository} from './repository/repository-eventlog'
import {LocalEventLog} from './eventlog/eventlog-local'
import {
  AddOrUpdateNodeEventPayload,
  ReparentNodeEventPayload,
  ReorderChildNodeEventPayload,
  LOGOOT_EVENT_GC_FILTER,
} from './eventlog/eventlog'
import { RemoteEventLog } from './remote/eventlog-remote'
import { addOrUpdateNodeEventPayloadDeserializer, reparentNodeEventPayloadDeserializer, reorderChildNodeEventPayloadDeserializer } from './remote/serialization'

/*
 * This file wires everything together for the dendriform tree.
 */

const nodeEventLog = new LocalEventLog<AddOrUpdateNodeEventPayload>('dendriform-node-eventlog')
const remoteNodeEventLog = new RemoteEventLog('/', 'dendriform-node-eventlog', addOrUpdateNodeEventPayloadDeserializer)

const treeEventLog = new LocalEventLog<ReparentNodeEventPayload>('dendriform-tree-eventlog')
const remoteTreeEventLog = new RemoteEventLog('/', 'dendriform-tree-eventlog', reparentNodeEventPayloadDeserializer)

const childOrderEventLog = new LocalEventLog<ReorderChildNodeEventPayload>(
  'dendriform-childorder-eventlog', LOGOOT_EVENT_GC_FILTER)
const remoteChildOrderEventLog = new RemoteEventLog('/', 'dendriform-childorder-eventlog', reorderChildNodeEventPayloadDeserializer)

// TODO: refactor this use of arrays to use some object and assign with destructuring or something
const treeComponentAndServicePromise: Promise<any[]> = nodeEventLog.init()
  .then(() => treeEventLog.init())
  .then(() => childOrderEventLog.init())
  .then(() => new EventlogRepository(nodeEventLog, treeEventLog, childOrderEventLog).init())
  .then(repository => {
    const treeService = new TreeService(repository)
    const commandHandler = new UndoableCommandHandler(new TreeServiceCommandHandler(treeService))
    return [new Tree(commandHandler, treeService), treeService]
  })
// TODO: instantiate and wire eventpumps


export function updateTree(nodeId: string) {
  console.log(`updateTree called`)
  treeComponentAndServicePromise
    .then(objects => (objects[1] as TreeService).loadTree(nodeId)
      .then(tree => objects[0].update(tree)))
}

export function initTree(el: Element): void {
  console.log(`initTree called`)
  document.addEventListener('DOMContentLoaded', () => {
    treeComponentAndServicePromise.then(objects => mount(el, objects[0]))
  })
}


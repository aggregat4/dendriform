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
import { EventPump } from './remote/eventpump';

/*
 * This file wires everything together for the dendriform tree.
 */

const localNodeEventLog = new LocalEventLog<AddOrUpdateNodeEventPayload>('dendriform-node-eventlog')
const remoteNodeEventLog = new RemoteEventLog('/', 'dendriform-node-eventlog', addOrUpdateNodeEventPayloadDeserializer)

const localTreeEventLog = new LocalEventLog<ReparentNodeEventPayload>('dendriform-tree-eventlog')
const remoteTreeEventLog = new RemoteEventLog('/', 'dendriform-tree-eventlog', reparentNodeEventPayloadDeserializer)

const localChildOrderEventLog = new LocalEventLog<ReorderChildNodeEventPayload>(
  'dendriform-childorder-eventlog', LOGOOT_EVENT_GC_FILTER)
const remoteChildOrderEventLog = new RemoteEventLog('/', 'dendriform-childorder-eventlog', reorderChildNodeEventPayloadDeserializer)

const nodeEventPump = new EventPump(localNodeEventLog, remoteNodeEventLog)
const treeEventPump = new EventPump(localTreeEventLog, remoteTreeEventLog)
const childOrderEventPump = new EventPump(localChildOrderEventLog, remoteChildOrderEventLog)

// TODO: refactor this use of arrays to use some object and assign with destructuring or something
const treePromise = localNodeEventLog.init()
  .then(() => localTreeEventLog.init())
  .then(() => localChildOrderEventLog.init())
  .then(() => nodeEventPump.init()).then(() => nodeEventPump.start())
  .then(() => treeEventPump.init()).then(() => treeEventPump.start())
  .then(() => childOrderEventPump.init()).then(() => childOrderEventPump.start())
  .then(() => new EventlogRepository(localNodeEventLog, localTreeEventLog, localChildOrderEventLog).init())
  .then(repository => {
    const treeService = new TreeService(repository)
    const commandHandler = new UndoableCommandHandler(new TreeServiceCommandHandler(treeService))
    return new Tree(commandHandler, treeService)
  })

export function updateTree(nodeId: string) {
  treePromise.then(tree => tree.loadNode(nodeId))
}

export function initTree(el: Element): void {
  document.addEventListener('DOMContentLoaded', () => {
    treePromise.then(tree => mount(el, tree))
  })
}

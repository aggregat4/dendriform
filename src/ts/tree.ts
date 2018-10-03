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

const nodeEventLog = new LocalEventLog<AddOrUpdateNodeEventPayload>('dendriform-node-eventlog')
const treeEventLog = new LocalEventLog<ReparentNodeEventPayload>('dendriform-tree-eventlog')
const childOrderEventLog = new LocalEventLog<ReorderChildNodeEventPayload>(
  'dendriform-childorder-eventlog', LOGOOT_EVENT_GC_FILTER)

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

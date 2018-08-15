import {mount} from 'redom'
import {PouchDbRepository} from './repository/repository-pouchdb'
import {TreeService} from './service/tree-service'
import {TreeServiceCommandHandler} from './commands/command-handler-tree-service'
import {UndoableCommandHandler} from './commands/command-handler-undoable'
import {Tree} from './view/tree-component'
import { EventlogRepository } from './repository/repository-eventlog'
import { LocalEventLog } from './eventlog/eventlog-local'
import { AddOrUpdateNodeEventPayload, ReparentNodeEventPayload } from './eventlog/eventlog'

// const repository = new PouchDbRepository()
const nodeEventLog = new LocalEventLog<AddOrUpdateNodeEventPayload>('dendriform-node-eventlog')
const treeEventLog = new LocalEventLog<ReparentNodeEventPayload>('dendriform-tree-eventlog')
const repository = new EventlogRepository(nodeEventLog, nodeEventLog, treeEventLog, treeEventLog)
const treeService = new TreeService(repository)
const commandHandler = new UndoableCommandHandler(new TreeServiceCommandHandler(treeService))
const treeComponent = new Tree(commandHandler, treeService)

export function updateTree(nodeId: string) {
  treeService.loadTree(nodeId).then(tree => treeComponent.update(tree))
}

export function initTree(el: Element): void {
  document.addEventListener('DOMContentLoaded', () => {
    mount(el, treeComponent)
  })
}

import {mount} from 'redom'
import {State, Status, LoadedTree} from './domain/domain'
import {PouchDbRepository} from './repository/repository-pouchdb'
import {TreeService} from './service/tree-service'
import {TreeServiceCommandHandler} from './service/command-handler-tree-service'
import {UndoableCommandHandler} from './service/command-handler-undoable'
import {Tree} from './view/tree-component'

const treeService = new TreeService(new PouchDbRepository())
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

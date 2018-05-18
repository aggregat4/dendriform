import {mount} from 'redom'
import {State, Status, LoadedTree} from './domain/domain'
import {PouchDbRepository} from './repository/repository-pouchdb'
import {RepositoryService} from './service/repository-service'
import {RepositoryTreeService} from './service/tree-service-repository'
import {UndoableTreeService} from './service/tree-service-undoable'
import {Tree} from './view/tree-component'

const treeService = new UndoableTreeService(new RepositoryTreeService(new RepositoryService(new PouchDbRepository())))
const loadingTree = {status: {state: State.LOADING}}
const treeComponent = new Tree(loadingTree, treeService)

export function updateTree(nodeId: string) {
  treeService.loadTree(nodeId).then(tree => treeComponent.update(tree))
}

export function initTree(el: Element, nodeId: string): void {
  document.addEventListener('DOMContentLoaded', () => {
    mount(el, treeComponent)
  })
}

import {mount} from 'redom'
import {State, Status, LoadedTree, getRequestedNodeId} from './tree-api'
import {UndoableTreeService} from './tree-service-undoable'
import {Tree} from './tree-component'

const treeService = new UndoableTreeService()

const loadingTree = {status: {state: State.LOADING}}

const treeComponent = new Tree(loadingTree, treeService)

function update() {
  treeService.loadTree(getRequestedNodeId())
    .then(tree => {
      treeComponent.update(tree)
    })
}

update()

document.addEventListener('DOMContentLoaded', () => {
  mount(document.body, treeComponent)
})

// Trigger a reload when the URL changes (the hash part)
window.addEventListener('hashchange', update)

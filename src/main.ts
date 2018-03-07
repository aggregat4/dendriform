import {getHashValue} from './util'
import {mount} from 'redom'
import {State, Status, LoadedTree} from './tree-api'
import {UndoableTreeService} from './tree-manager'
import {Tree} from './tree-component'

function getRequestedNodeId() {
  return getHashValue('node') || 'ROOT'
}

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

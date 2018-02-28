import {getHashValue} from './util'
import {el, mount} from 'redom'
import {State, Status, ResolvedRepositoryNode, RepositoryNode, LoadedTree} from './tree-api'
import { UndoableTreeService } from './tree-manager'

const treeService = new UndoableTreeService()

function getRequestedNodeId() {
  return getHashValue('node') || 'ROOT'
}

class Tree {
  private el
  private error
  private root

  constructor(tree: LoadedTree) {
    this.el = el('div.tree',
      tree.status.state === State.ERROR
        && (this.error = el('div.error', `Can not load tree from backing store: ${tree.status.msg}`)),
      tree.status.state === State.LOADING
        && (this.error = el('div.error', `Loading tree...`)),
      tree.status.state === State.LOADED
        && (this.root = new TreeNode(tree.tree, true)),
    )
  }
}

function isRoot(node: RepositoryNode): boolean {
  return node._id === 'ROOT'
}

function genClass(node: ResolvedRepositoryNode, isFirst: boolean): string {
  return 'node' + (isRoot(node.node) ? ' root' : '') + (isFirst ? ' first' : '')
}

class TreeNode {
  private el

  constructor(treeNode: ResolvedRepositoryNode, first: boolean) {
    this.el = el('div', {class: genClass(treeNode, first)},
      el('a', { href: `#node=${treeNode.node._id}` }, '*'),
      el('div.name', treeNode.node.name),
    )
  }
}

const sample1 = {status: {state: State.LOADING}}

const sample2 = 

const treeComponent = new Tree(sample1)

document.addEventListener('DOMContentLoaded', () => {
  mount(document.body, treeComponent)
})

/*

import * as treecomponent from './tree-component'

function getRequestedNodeId(): string {
  return getHashValue('node') || 'ROOT'
}

const projector = createProjector()

// Initially trigger a load of the store (async) so we have something to display ASAP
navigateAndReload()
// Trigger a reload when the URL changes (the hash part)
window.addEventListener('hashchange', navigateAndReload)
// The 'treereload' event is custom and can be triggered in a component to indicate
// that the store needs to be reloaded (and rerendered)
window.addEventListener('treereload', justReload)

function navigateAndReload(): void {
  reload(true)
}

function justReload(): void {
  reload(false)
}

function reload(hasNavigated): void {
  treecomponent.load(getRequestedNodeId(), !!hasNavigated)
    .then(() => {
      // tslint:disable-next-line:no-console
      console.log(`Tree was loaded`)
      projector.scheduleRender()
    })
}

// NEVER FORGET TO DEFER DOM INITIALISATION STUFF UNTIL THE DOM IS LOADED
// YOU TWAT
document.addEventListener('DOMContentLoaded', () => {
  projector.append(
    document.querySelector('#treething'),
    treecomponent.render)
})
*/

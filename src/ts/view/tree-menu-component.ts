import { h } from '../lib/hyperscript.js'
import { TreeAction, TreeActionContext } from './tree-actions'

export class TreeNodeMenu extends HTMLElement {
  menuItems: TreeNodeMenuItem[]
  private closeButton: HTMLElement

  constructor() {
    super()
  }

  connectedCallback() {
    if (!this.closeButton) {
      this.setAttribute('class', 'popup menu')
      this.closeButton = h('div.closeButton')
      this.append(this.closeButton)
      for (const menuItem of this.menuItems) {
        this.append(menuItem)
      }
    }
  }
}

export class TreeNodeMenuItem extends HTMLElement {
  treeAction: TreeAction
  treeActionContext: TreeActionContext

  constructor() {
    super()
    if (this.childElementCount <= 0) {
      this.setAttribute('class', 'menuItem')
      this.append(h('span.name', this.treeAction.name))
      this.append(h('span.shortcut', this.treeAction.trigger.toString()))
      this.addEventListener('click', e => {
        this.treeAction.handler(e, this.treeActionContext)
      })
    }
  }

  connectCallback() {
    if (this.childElementCount <= 0) {
      this.setAttribute('class', 'menuItem')
      this.append(h('span.name', this.treeAction.name))
      this.append(h('span.shortcut', this.treeAction.trigger.toString()))
      this.addEventListener('click', e => {
        this.treeAction.handler(e, this.treeActionContext)
      })
    }
  }
}

customElements.define('tree-node-menu', TreeNodeMenu)
customElements.define('tree-node-menuitem', TreeNodeMenuItem)

import { h } from '../lib/hyperscript.js'
import { TreeAction, TreeActionContext } from './tree-actions'
import { DialogElement } from './dialogs'

export class TreeNodeMenu extends DialogElement {
  private closeButton: HTMLElement

  constructor(readonly menuItems: TreeNodeMenuItem[]) {
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

  getCloseButton(): HTMLElement {
    return this.closeButton
  }
}

export class TreeNodeMenuItem extends HTMLElement {
  constructor(readonly treeAction: TreeAction, readonly treeActionContext: TreeActionContext) {
    super()
  }

  connectedCallback() {
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

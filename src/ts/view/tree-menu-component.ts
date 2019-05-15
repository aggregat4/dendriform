import h from 'hyperscript'
import { TreeAction, TreeActionContext } from './tree-actions'
import { DialogElement } from './dialogs'

export class TreeNodeMenu extends DialogElement {
  constructor(readonly menuItems: TreeNodeMenuItem[]) {
    super()
  }

  connectedCallback() {
    this.maybeInit(() => {
      for (const menuItem of this.menuItems) {
        this.append(menuItem)
      }
    })
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
      this.append(h('kbd', this.treeAction.trigger.toString()))
      this.addEventListener('click', e => {
        this.treeAction.handler(e, this.treeActionContext)
      })
    }
  }
}

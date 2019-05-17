import h from 'hyperscript'
import { TreeAction, TreeActionContext } from './tree-actions'
import { DialogElement } from './dialogs'
import { DateTime } from 'luxon'

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

  beforeShow(): void {
    for (const menuItem of this.menuItems) {
      menuItem.beforeShow()
    }
  }
}

abstract class TreeNodeMenuItem extends HTMLElement {
  beforeShow(): void {
    // no default action
  }
}

export class TreeNodeActionMenuItem extends TreeNodeMenuItem {
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

export class TreeNodeInfoMenuItem extends TreeNodeMenuItem {
  readonly nodeInfoEl: Element = h('span.content', 'No node selected.')

  constructor(readonly treeActionContext: TreeActionContext) {
    super()
  }

  connectedCallback() {
    if (this.childElementCount <= 0) {
      this.setAttribute('class', 'menuItem disabled')
      this.append(this.nodeInfoEl)
    }
  }

  private formatDate(date: string): string {
    return DateTime.fromISO(date).toLocaleString(DateTime.DATETIME_MED)
  }

  beforeShow(): void {
    const activeNodeId = this.treeActionContext.transientStateManager.getActiveNodeId()
    if (activeNodeId) {
      this.treeActionContext.treeService.getNode(activeNodeId)
        .then(node => this.nodeInfoEl.textContent =
          `Created: ${this.formatDate(node.created)}, Updated: ${this.formatDate(node.updated)}`)
    }
  }

}

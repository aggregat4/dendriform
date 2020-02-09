import { html, render } from 'lit-html'
import { TreeAction, TreeActionContext } from './tree-actions'
import { DialogElement } from './dialogs'
import { epochSecondsToLocaleString } from '../utils/dateandtime'

export class TreeNodeMenu extends DialogElement {

  constructor() {
    super()
  }

  protected initDialogContents() {
    // NOOP
  }

  beforeShow(): void {
    const menuItems = this.querySelectorAll('.menuItem') as unknown as TreeNodeMenuItem[]
    for (const menuItem of menuItems) {
      menuItem.beforeShow()
    }
  }
}

abstract class TreeNodeMenuItem extends HTMLElement {
  private _treeActionContext: TreeActionContext

  set treeActionContext(treeActionContext: TreeActionContext) {
    this._treeActionContext = treeActionContext
  }

  get treeActionContext(): TreeActionContext {
    return this._treeActionContext
  }

  beforeShow(): void {
    // no default action
  }
}

export class TreeNodeActionMenuItem extends TreeNodeMenuItem {
  private _treeAction: TreeAction
  private readonly template = () => html`
    <div class="menuItem" @click=${this.onClick}>
      <span class="name">${this.treeAction?.name || ''}<span>
      <kbd>${this.treeAction?.trigger.toString() || ''}</kbd>
    </div>`

  set treeAction(treeAction: TreeAction) {
    this._treeAction = treeAction
  }

  get treeAction(): TreeAction {
    return this._treeAction
  }

  private onClick(e) {
    return this._treeAction.handler(e, this.treeActionContext)
  }

  connectedCallback() {
    render(this.template(), this)
  }
}

export class TreeNodeInfoMenuItem extends TreeNodeMenuItem {
  private readonly DEFAULT_INFO_TEXT = 'No node selected.'
  private readonly template = () => html`
    <div class="menuItem disabled">
      <span class="infoContent">${this.getInfoContent()}</span>
    </div>
    `

  connectedCallback() {
    render(this.template(), this)
  }

  private async getInfoContent() {
    const activeNodeId = this.treeActionContext?.transientStateManager.getActiveNodeId()
    if (activeNodeId) {
      const activeNode = await this.treeActionContext.treeService.loadNode(activeNodeId)
      return `Created: ${epochSecondsToLocaleString(activeNode.created)}, Updated: ${epochSecondsToLocaleString(activeNode.updated)}`
    } else {
      return this.DEFAULT_INFO_TEXT
    }
  }

  async beforeShow(): Promise<void> {
    render(this.template, this)
  }

}

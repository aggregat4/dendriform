import { html, render } from 'lit-html'
import {until} from 'lit-html/directives/until'
import { TreeAction, TreeActionContext } from './tree-actions'
import { epochSecondsToLocaleString } from '../utils/dateandtime'
import { DialogLifecycleAware } from './dialogs'

abstract class TreeNodeMenuItem extends HTMLElement {
  private _treeActionContext: TreeActionContext

  constructor() {
    super()
    this.attachShadow({mode: 'open'})
  }

  set treeActionContext(treeActionContext: TreeActionContext) {
    this._treeActionContext = treeActionContext
  }

  get treeActionContext(): TreeActionContext {
    return this._treeActionContext
  }

  protected get menuItemStyle() {
    return html`<style>
    .menuItem {
      display: block;
      padding: 6px 12px 6px 12px;
      max-width: 300px;
    }

    .menuItem:hover {
      background-color: var(--highlight-bgcolor);
      color: var(--highlight-color);
      cursor: pointer;
    }

    .menuItem.disabled,
    .menuItem.disabled:hover {
      background-color: inherit;
      color: var(--disabled-text-color);
      cursor: inherit;
    }
    </style>`
  }

}

export class TreeNodeActionMenuItem extends TreeNodeMenuItem {
  private _treeAction: TreeAction
  private readonly template = () => html`
    ${this.menuItemStyle}
    <div class="menuItem" @click=${this.onClick.bind(this)}>
      <span class="name">${this.treeAction?.name || ''}<span>
      <kbd>${this.treeAction?.trigger.toString() || ''}</kbd>
      <slot></slot>
    </div>`

  constructor() {
    super()
  }

  set treeAction(treeAction: TreeAction) {
    this._treeAction = treeAction
  }

  get treeAction(): TreeAction {
    return this._treeAction
  }

  private onClick(e) {
    return this._treeAction.handle(e, this.treeActionContext)
  }

  connectedCallback(): void {
    render(this.template(), this.shadowRoot)
  }
}

customElements.define('df-menuitem-action', TreeNodeActionMenuItem)

export class TreeNodeInfoMenuItem extends TreeNodeMenuItem implements DialogLifecycleAware {
  private readonly DEFAULT_INFO_TEXT = 'No node selected.'
  private readonly template = () => html`
    ${this.menuItemStyle}
    <div class="menuItem disabled">
      <span class="infoContent">${until(this.getInfoContent(), '...')}</span>
    </div>`

  constructor() {
    super()
  }

  connectedCallback(): void {
    render(this.template(), this.shadowRoot)
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

  beforeShow(): void {
    render(this.template(), this.shadowRoot)
  }

}

customElements.define('df-menuitem-info', TreeNodeInfoMenuItem)

import { html, render } from 'lit-html'
import { TreeActionContext, TreeAction } from './tree-actions'
import { ResolvedRepositoryNode, ActivityIndicating } from '../domain/domain'
import { parseXML } from '../utils/util'
import { CommandBuilder, CreateChildNodeCommandPayload } from '../commands/commands'
import { CommandExecutor } from './tree-helpers'
import { opmlDocumentToRepositoryNodes } from '../opml/opml-util'
import { KeyboardEventTrigger, KbdEventType, NodeClassSelector } from './keyboardshortcut'
import { DialogElement, DialogLifecycleAware } from './dialogs'
import './activity-indicator-component' // for side effects
import { sharedCommonStyles } from './shared-styles'

export class OpmlImportAction extends TreeAction {
  constructor(readonly dialogElement: DialogElement) {
    super(new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name')),
      'Import OPML')
  }

  handle(event: Event, treeActionContext: TreeActionContext) {
    event.stopPropagation()
    treeActionContext.dialogs.showTransientDialog(null, this.dialogElement)
  }
}

export class OpmlImportDialog extends HTMLElement implements ActivityIndicating, DialogLifecycleAware {
  private _treeActionContext: TreeActionContext
  private importing: boolean = false
  private success = null
  private error = null
  private disabled = true

  private readonly importTemplate = () => html`
    ${sharedCommonStyles}
    <style>
      /* ---------- OPML Import component ---------- */
      .opml-import-dialog {
        width: 400px;
        padding: 6px;
      }
        /* Need to align the baseline, otherwise the text
          is not really centered vertically */

      .opml-import-dialog .error {
        color: red;
      }

      .opml-import-dialog .success {
        color: green;
      }

      .opml-import-dialog input.uploadOpml {
        max-width: 350px;
      }

      .opml-import-dialog div.error,
      .opml-import-dialog div.success,
      .opml-import-dialog input.uploadOpml,
      .opml-import-dialog button.import,
      .opml-import-dialog h1 {
        margin: 6px 12px 6px 12px;
      }
    </style>
    <div class="opml-import-dialog activityIndicating">
      <section>
        <header>
          <h1>Import OPML</h1>
        </header>
        ${this.error ? html`<div class="error">${this.error}</div>` : ''}
        ${this.success ? html`<div class="success">${this.success}</div>` : ''}
        <input class="uploadOpml" type="file" @change=${this.handleFilesChanged.bind(this)}>Select OPML File</input>
        <button class="import primary" ?disabled=${this.disabled} @click=${this.importFile.bind(this)}>Import File</button>
        <df-spinner delayMs="250"/>
      </section>
    </div>`

  constructor() {
    super()
    this.attachShadow({mode: 'open'})
  }

  connectedCallback() {
    this.rerender()
  }

  beforeShow() {
    this.resetFileSelector()
    this.success = null
    this.error = null
    this.rerender()
  }

  private rerender() {
    render(this.importTemplate(), this.shadowRoot)
  }

  private getUploadInput(): HTMLInputElement {
    return this.shadowRoot.querySelector('input.uploadOpml') as HTMLInputElement
  }

  isActive(): boolean {
    return this.importing
  }

  getActivityTitle(): string {
    return 'Creating imported nodes...'
  }

  private handleFilesChanged(event: Event): void {
    const files: FileList = (event.target as any).files as FileList
    if (files && files.length > 0) {
      this.disabled = false
    }
    this.rerender()
  }

  private importFile(event: Event): void {
    const uploadInput = this.getUploadInput()
    const files: FileList = uploadInput.files as FileList
    if (files && files.length > 0) {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const doc = parseXML(reader.result as string)
          const rootNodes = opmlDocumentToRepositoryNodes(doc)
          const parentId = this._treeActionContext.transientStateManager.getActiveNodeId()
          // disable import button to prevent duplicate clicks
          this.disabled = true
          // make sure the spinner starts spinning
          this.importing = true
          this.rerender()
          console.log(`starting to create root nodes for opml import`)
          for (const node of rootNodes) {
            await this.createNode(this._treeActionContext.commandExecutor, node, parentId)
          }
          console.log(`done creating root nodes after opml import`)
          this.success = 'Successfully imported OPML file'
          this.disabled = true
          this.resetFileSelector()
          this.rerender()
        } catch (error) {
          console.error(error)
          this.error = error.message
          this.rerender()
          return
        } finally {
          this.importing = false
          this.rerender()
        }
      }
      reader.readAsText(files[0])
    }
  }

  private resetFileSelector() {
    (this.shadowRoot.querySelector('.uploadOpml') as HTMLInputElement).value = ''
  }

  private async createNode(commandExecutor: CommandExecutor, node: ResolvedRepositoryNode, parentId: string): Promise<void> {
    const command = new CommandBuilder(
      new CreateChildNodeCommandPayload(node.node._id, node.node.name, node.node.note, parentId))
      .isUndoable()
      .isBatch()
      .build()
    // It is important to await here since when create a child node we need the parent node to already be there
    // otherwise the effect will be that only the toplevel nodes are visible
    await commandExecutor.performWithDom(command)
    // NOTE: this assumes that the children are always loaded
    for (const childNode of node.children.elements) {
      await this.createNode(commandExecutor, childNode, node.node._id)
    }
  }

  set treeActionContext(treeActionContext: TreeActionContext) {
    this._treeActionContext = treeActionContext
  }
}

customElements.define('df-omplimportdialog', OpmlImportDialog)

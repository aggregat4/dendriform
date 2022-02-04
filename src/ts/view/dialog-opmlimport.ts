import { html, render } from 'lit-html'
import { TreeActionContext } from './tree-actions'
import { parseXML } from '../utils/util'
import { CommandBuilder, CreateChildNodeCommandPayload } from '../commands/commands'
import { CommandExecutor } from './tree-helpers'
import { opmlDocumentToRepositoryNodes } from '../opml/opml-util'
import { DialogLifecycleAware } from './dialogs'
import { sharedCommonStyles } from './shared-styles'
import { ActivityIndicating } from '../domain/lifecycle'
import { ResolvedRepositoryNode } from '../repository/repository'
import { ActivityIndicator } from './activity-indicator-component'

export class OpmlImportDialog
  extends HTMLElement
  implements ActivityIndicating, DialogLifecycleAware
{
  private _treeActionContext: TreeActionContext
  private importing = false
  private success = null
  private error: string = null
  private disabled = true

  private readonly importTemplate = () => html` ${sharedCommonStyles}
    <style>
      /* ---------- OPML Import component ---------- */
      .opml-import-dialog {
        width: 550px;
        max-width: 550px;
        padding: 6px;
      }

      .opml-import-dialog input[type='file'] {
        width: calc(100% - 24px);
      }

      .opml-import-dialog .error {
        color: red;
      }

      .opml-import-dialog .success {
        color: green;
      }

      .opml-import-dialog section > * {
        margin: 6px 12px 6px 12px;
      }

      .bottom-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
    </style>
    <div class="opml-import-dialog activityIndicating">
      <section>
        <header>
          <h1>Import OPML</h1>
        </header>
        ${this.error ? html`<div class="error">${this.error}</div>` : ''}
        ${this.success ? html`<div class="success">${this.success}</div>` : ''}
        <input id="uploadopml" type="file" @change=${this.handleFilesChanged.bind(this)} />
        <div class="bottom-row">
          <button
            class="import primary"
            ?disabled=${this.disabled}
            @click=${this.importFile.bind(this)}
            >Import File</button
          >
          <df-spinner delayMs="250" />
        </div>
      </section>
    </div>`

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  connectedCallback(): void {
    this.rerender()
    const spinner = this.shadowRoot.querySelector('df-spinner') as ActivityIndicator
    spinner.activityIndicating = this
  }

  beforeShow(): void {
    this.resetFileSelector()
    this.success = null
    this.error = null
    this.rerender()
  }

  private rerender() {
    render(this.importTemplate(), this.shadowRoot)
  }

  private getUploadInput(): HTMLInputElement {
    return this.shadowRoot.querySelector('input#uploadopml')
  }

  isActive(): boolean {
    return this.importing
  }

  getActivityTitle(): string {
    return 'Creating imported nodes...'
  }

  private handleFilesChanged(event: Event): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const files: FileList = (event.target as any).files as FileList
    if (files && files.length > 0) {
      this.disabled = false
    }
    this.rerender()
  }

  private importFile(): void {
    const uploadInput = this.getUploadInput()
    const files: FileList = uploadInput.files
    if (files && files.length > 0) {
      const reader = new FileReader()
      reader.onload = async () => {
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
        } catch (error) {
          console.error(error)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          this.error = error.message
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    ;(this.shadowRoot.querySelector('#uploadopml') as HTMLInputElement).value = ''
  }

  private async createNode(
    commandExecutor: CommandExecutor,
    node: ResolvedRepositoryNode,
    parentId: string
  ): Promise<void> {
    const command = new CommandBuilder(
      new CreateChildNodeCommandPayload(node.node.id, node.node.name, node.node.note, parentId)
    )
      .isUndoable()
      .isBatch()
      .build()
    // It is important to await here since when create a child node we need the parent node to already be there
    // otherwise the effect will be that only the toplevel nodes are visible
    await commandExecutor.performWithoutDom(command)
    // NOTE: this assumes that the children are always loaded
    for (const childNode of node.children.elements) {
      await this.createNode(commandExecutor, childNode, node.node.id)
    }
  }

  set treeActionContext(treeActionContext: TreeActionContext) {
    this._treeActionContext = treeActionContext
  }
}

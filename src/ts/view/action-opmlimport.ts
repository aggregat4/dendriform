import { html, render } from 'lit-html'
import { TreeAction, TreeActionContext } from './tree-actions'
import { KeyboardEventTrigger, KbdEventType, NodeClassSelector } from './keyboardshortcut'
import { DialogElement } from './dialogs'
import { ResolvedRepositoryNode, ActivityIndicating } from '../domain/domain'
import { parseXML } from '../utils/util'
import { CommandBuilder, CreateChildNodeCommandPayload } from '../commands/commands'
import { CommandExecutor } from './tree-helpers'
import { opmlDocumentToRepositoryNodes } from '../opml/opml-util'

// TODO: not sure we need a keyboard trigger for this, perhaps we need a NoOp keyboard trigger?
// TODO: move these into the registry proper identifiable by some name?
export const importOpmlAction = new TreeAction(
  new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name')),
  onOpmlImport,
  'Import OPML')

class OpmlImportDialog extends DialogElement implements ActivityIndicating {
  private treeActionContext: TreeActionContext
  private importing: boolean = false
  private success = null
  private error = null
  private disabled = true

  private readonly importTemplate = () => html`
    <div class="opmlImportPopup activityIndicating">
      <section>
        <header>
          <h1>Import OPML</h1>
        </header>
        ${this.error ? html`<div class="error">${this.error}</div>` : ''}
        ${this.success ? html`<div class="success">${this.success}</div>` : ''}
        <input class="uploadOpml" type="file" @change=${this.handleFilesChanged.bind(this)}>Select OPML File</input>
        <button class="import primary" disabled="${this.disabled}" @click=${this.importFile.bind(this)}>Import File</button>
        <a4-spinner delayMs="250"/>
      </section>
    </div>`

  constructor() {
    super()
  }

  private rerender() {
    render(this.importTemplate(), this.getContainer())
  }

  private getUploadInput(): HTMLInputElement {
    return this.querySelector('input.upload') as HTMLInputElement
  }

  protected initDialogContents() {
    this.rerender()
  }

  destroy(): void {
    this.rerender()
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
          const parentId = this.treeActionContext.transientStateManager.getActiveNodeId()
          // disable import button to prevent duplicate clicks
          this.disabled = true
          // make sure the spinner starts spinning
          this.importing = true
          this.rerender()
          for (const node of rootNodes) {
            await this.createNode(this.treeActionContext.commandExecutor, node, parentId)
          }
        } catch (error) {
          console.error(error)
          this.error = error.message
          this.rerender()
          return
        } finally {
          this.importing = false
        }
        this.success = 'Successfully imported OPML file'
        this.close()
      }
      reader.readAsText(files[0])
    }
    this.rerender()
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

  setTreeActionContext(treeActionContext: TreeActionContext): void {
    this.treeActionContext = treeActionContext
  }
}

customElements.define('tree-opmlimport-dialog', OpmlImportDialog)
const opmlImportMenu = new OpmlImportDialog()

// A general init function (that we probably need for each component) to make sure
// it can register custom elements and can put things under the root DOM node (for
// dialogs for example)
// TODO: do we like this? We need something like it but can we make it more general?
export function mount(rootElement: Element) {
  rootElement.appendChild(opmlImportMenu)
}

export function unmount(rootElement: Element) {
  rootElement.removeChild(opmlImportMenu)
}

// show dialog with: File Upload button, Import button (no copy paste yet, or start with that?)
// upload client side and parse the opml
// create that tree as a child of the current node (how do I programmatically create nodes in batch!?)
function onOpmlImport(event: Event, treeActionContext: TreeActionContext) {
  console.debug(`clicked on OPML import action`)
  const clickedElement = event.target as HTMLElement
  // since the dialog is already on the page we need to set the correct context for the current action
  opmlImportMenu.setTreeActionContext(treeActionContext)
  treeActionContext.dialogs.showTransientDialog(clickedElement, opmlImportMenu)
}

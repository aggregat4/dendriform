import h from 'hyperscript'
import { TreeAction, TreeActionContext } from './tree-actions'
import { KeyboardEventTrigger, KbdEventType, NodeClassSelector } from './keyboardshortcut'
import { DialogElement } from './dialogs'
import { ResolvedRepositoryNode, createNewResolvedRepositoryNodeWithContent, ActivityIndicating } from '../domain/domain'
import { generateUUID, parseXML } from '../utils/util'
import { CommandBuilder, CreateChildNodeCommandPayload } from '../commands/commands'
import { CommandExecutor } from './tree-helpers'
import { ActivityIndicator } from './activity-indicator-component'
import { opmlDocumentToRepositoryNodes } from '../opml/opml-util'

// TODO: not sure we need a keyboard trigger for this, perhaps we need a NoOp keyboard trigger?
// TODO: move these into the registry proper identifiable by some name?
export const importOpmlAction = new TreeAction(
  new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name')),
  onOpmlImport,
  'Import OPML')

class OpmlImportDialog extends DialogElement implements ActivityIndicating {
  private uploadButton: HTMLInputElement
  private importButton: HTMLInputElement
  private treeActionContext: TreeActionContext
  private errorElement: HTMLElement
  private successElement: HTMLElement
  private spinner: ActivityIndicator
  private importing: boolean = false

  constructor() {
    super()
  }

  connectedCallback() {
    super.maybeInit(() => {
      this.classList.add('opmlImportPopup')
      // <input type="file" id="input" onchange="handleFiles(this.files)">
      this.errorElement = h('div.error', 'error')
      this.successElement = h('div.success', 'success')
      this.uploadButton = h('input.uploadOpml', {type: 'file'}, 'Select OPML File')
      this.importButton = h('button.import.primary', {disabled: true}, 'Import File')
      this.spinner = new ActivityIndicator(this, 250)
      const wrapper = h('section',
        h('header', h('h1', 'Import OPML')),
        this.errorElement,
        this.successElement,
        this.uploadButton,
        this.importButton,
        this.spinner)
      this.append(wrapper)
      this.uploadButton.addEventListener('change', this.handleFilesChanged.bind(this), false)
      this.importButton.addEventListener('click', this.importFile.bind(this), false)
    })
  }

  destroy(): void {
    this.uploadButton.value = null
    this.importButton.disabled = true
    this.successElement.innerText = ''
    this.successElement.style.display = 'none'
    this.errorElement.innerText = ''
    this.errorElement.style.display = 'none'
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
      this.importButton.disabled = false
    }
  }

  private importFile(event: Event): void {
    const files: FileList = this.uploadButton.files as FileList
    if (files && files.length > 0) {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const doc = parseXML(reader.result as string)
          const rootNodes = opmlDocumentToRepositoryNodes(doc)
          const parentId = this.treeActionContext.transientStateManager.getActiveNodeId()
          // disable import button to prevent duplicate clicks
          this.importButton.disabled = true
          // make sure the spinner starts spinning
          this.importing = true
          // TODO: this doesn't actually appear, the following operations maybe block the UI thread when doing large imports?
          this.spinner.updateActivityStatus()
          for (const node of rootNodes) {
            await this.createNode(this.treeActionContext.commandExecutor, node, parentId)
          }
        } catch (error) {
          console.error(error)
          this.errorElement.style.display = 'block'
          this.successElement.style.display = 'none'
          this.errorElement.innerText = error.message
          return
        } finally {
          this.importing = false
        }
        this.errorElement.style.display = 'none'
        this.successElement.style.display = 'block'
        this.successElement.innerText = 'Successfully imported OPML file'
        this.close()
      }
      reader.readAsText(files[0])
    }
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
export function init(rootElement: Element) {
  rootElement.appendChild(opmlImportMenu)
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

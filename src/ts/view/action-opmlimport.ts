import { h } from '../lib/hyperscript.js'
import { TreeAction, TreeActionContext } from './tree-actions'
import { KeyboardEventTrigger, KbdEventType, NodeClassSelector } from './keyboardshortcut'
import { DialogElement } from './dialogs'
import { ResolvedRepositoryNode, createNewResolvedRepositoryNodeWithContent } from '../domain/domain'
import { generateUUID } from '../util'
import { CommandBuilder, CreateChildNodeCommandPayload } from '../commands/commands'
import { CommandExecutor } from './tree-helpers'

// TODO: not sure we need a keyboard trigger for this, perhaps we need a NoOp keyboard trigger?
// TODO: move these into the registry proper identifiable by some name?
export const importOpmlAction = new TreeAction(
  new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name')),
  onOpmlImport,
  'Import OPML')

class OpmlImportDialog extends DialogElement {
  private uploadButton: HTMLInputElement
  private importButton: HTMLInputElement
  private treeActionContext: TreeActionContext
  private errorElement: HTMLElement
  private successElement: HTMLElement

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
      const wrapper = h('section',
        h('header', h('h1', 'Import OPML')),
        this.errorElement,
        this.successElement,
        this.uploadButton,
        this.importButton)
      this.append(wrapper)
      this.uploadButton.addEventListener('change', this.handleFilesChanged.bind(this), false)
      this.importButton.addEventListener('click', this.importFile.bind(this), false)
    })
  }

  destroy(): void {
    this.uploadButton.value = null
    this.importButton.disabled = true
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
      reader.onload = (e) => {
        const doc = this.parseXML(reader.result as string)
        const rootNodes = this.opmlDocumentToRepositoryNodes(doc)
        const parentId = this.treeActionContext.transientStateManager.getActiveNodeId()
        for (const node of rootNodes) {
          this.createNode(this.treeActionContext.commandExecutor, node, parentId)
        }
        // TODO:
        // if success
        //    show success message instead of upload component
        // else if error
        //    show error message above upload component
      }
      reader.readAsText(files[0])
    }
  }

  private createNode(commandExecutor: CommandExecutor, node: ResolvedRepositoryNode, parentId: string): void {
    const command = new CommandBuilder(
      new CreateChildNodeCommandPayload(node.node._id, node.node.name, node.node.content, parentId))
      .isUndoable()
      .isBatch()
      .build()
    commandExecutor.performWithDom(command)
    for (const childNode of node.children) {
      this.createNode(commandExecutor, childNode, node.node._id)
    }
  }

  /**
   * Parses a DOM tree representing an OPML file into RepositoryNodes. We assume a workflowy
   * or dynalist like document. Currently only supports the node name and the note.
   *
   * In dynalist it is possible to have multiple root nodes (you can select a bunch of nodes
   * and export them) and this is also supported.
   */
  opmlDocumentToRepositoryNodes(doc: Document): ResolvedRepositoryNode[] {
    const opmlRootNode = doc.getRootNode().firstChild
    if (!opmlRootNode || opmlRootNode.nodeName.toUpperCase() !== 'OPML') {
      throw new Error(`Document is not OPML, root element is called ${doc.getRootNode().nodeName}`)
    }
    const bodyEl: Element = doc.querySelector('body')
    const rootOutlines = this.childElementsByName(bodyEl, 'outline')
    if (!rootOutlines || rootOutlines.length === 0) {
      throw new Error('OPML document is empty')
    }
    const repositoryNodes = []
    for (const rootOutline of rootOutlines) {
      const potentialRepositoryNode = this.opmlOutlineNodeToRepositoryNode(rootOutline)
      if (potentialRepositoryNode) {
        repositoryNodes.push(potentialRepositoryNode)
      }
    }
    return repositoryNodes
  }

  private childElementsByName(el: Element, name: string): Element[] {
    return Array.from(el.children).filter(c => c.nodeName.toUpperCase() === name.toUpperCase())
  }

  opmlOutlineNodeToRepositoryNode(outlineEl: Element): ResolvedRepositoryNode {
    if (outlineEl.tagName.toUpperCase() !== 'OUTLINE') {
      return null
    }
    const repoNode = createNewResolvedRepositoryNodeWithContent(
      generateUUID(),
      outlineEl.getAttribute('text'),
      outlineEl.getAttribute('_note'))
    const children = this.childElementsByName(outlineEl, 'outline')
    for (const child of children) {
      repoNode.children.push(this.opmlOutlineNodeToRepositoryNode(child))
    }
    return repoNode
  }

  private parseXML(content: string): Document {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'application/xml')
    // TODO: DOMParser returns an error document instead of throwing an exception on parsing, catch that
    return doc
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
  console.log(`clicked on OPML import action`)
  const clickedElement = event.target as HTMLElement
  // since the dialog is already on the page we need to set the correct context for the current action
  opmlImportMenu.setTreeActionContext(treeActionContext)
  treeActionContext.dialogs.showTransientDialog(clickedElement, opmlImportMenu)
}

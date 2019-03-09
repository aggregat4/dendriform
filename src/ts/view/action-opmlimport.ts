import { h } from '../lib/hyperscript.js'
import { TreeAction, TreeActionContext } from './tree-actions'
import { KeyboardEventTrigger, KbdEventType, NodeClassSelector } from './keyboardshortcut'
import { DialogElement } from './dialogs'
import { getClosestNodeElement } from './tree-dom-util'

// TODO: not sure we need a keyboard trigger for this, perhaps we need a NoOp keyboard trigger?
// TODO: move these into the registry proper identifiable by some name?
export const importOpmlAction = new TreeAction(
  new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name')),
  onOpmlImport,
  'Import OPML')

class OpmlImportDialog extends DialogElement {
  private uploadButton: HTMLElement
  private importButton: HTMLElement
  private treeActionContext: TreeActionContext

  constructor() {
    super()
  }

  connectedCallback() {
    super.maybeInit(() => {
      this.classList.add('opmlImportPopup')
      this.uploadButton = h('button.uploadOpml', 'Upload OPML')
      this.importButton = h('button.importOpml', 'Import OPML')
      this.append(this.uploadButton)
      this.append(this.importButton)
    })
  }

  setTreeActionContext(treeActionContext: TreeActionContext): void {
    this.treeActionContext = treeActionContext
  }
}

customElements.define('tree-opmlimport-dialog', OpmlImportDialog)
const opmlImportMenu = new OpmlImportDialog()
// TODO: does this conflict with other trees if we have more than one on the page? Should we not keep this in the root of the tree?
document.body.appendChild(opmlImportMenu)

// show dialog with: File Upload button, Import button (no copy paste yet, or start with that?)
// upload client side and parse the opml
// create that tree as a child of the current node (how do I programmatically create nodes in batch!?)
function onOpmlImport(event: Event, treeActionContext: TreeActionContext) {
  console.log(`clicked on OPML import action`)
  const clickedElement = event.target as HTMLElement
  const nodeElement = getClosestNodeElement(clickedElement)
  opmlImportMenu.setTreeActionContext(treeActionContext)
  treeActionContext.dialogs.showTransientDialog(clickedElement, opmlImportMenu)
}

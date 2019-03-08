import { h } from '../lib/hyperscript.js'
import { TreeAction, TreeActionContext } from './tree-actions'
import { KeyboardEventTrigger, KbdEventType, NodeClassSelector } from './keyboardshortcut'
import { DialogElement, Dialog } from './dialogs'

// TODO: not sure we need a keyboard trigger for this, perhaps we need a NoOp keyboard trigger?
// TODO: move these into the registry proper identifiable by some name?
export const importOpmlAction = new TreeAction(
  new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name')),
  onOpmlImport,
  'Import OPML')

class OpmlImportDialog extends DialogElement {
  private uploadButton: HTMLElement
  private importButton: HTMLElement

  constructor(readonly treeActionContext: TreeActionContext) {
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

}

customElements.define('tree-action-opmlimport', OpmlImportDialog)

function onOpmlImport(event: Event, treeActionContext: TreeActionContext) {
  // TODO: implement
  console.log(`clicked on OPML import action`)
  // show dialog with: File Upload button, Import button (no copy paste yet, or start with that?)
  // upload client side and parse the opml
  // create that tree as a child of the current node (how do I programmatically create nodes in batch!?)
  const opmlImportMenu = new OpmlImportDialog(treeActionContext)
  const clickedElement = event.target as HTMLElement
  // TODO: I am not happy with this adding the menu to the click target, what's a better way to manage these popup windows?
  // Have the Dialogs class add them to the body or something?
  const existingMenu = clickedElement.querySelector('opmlImportPopup')
  if (existingMenu) {
    clickedElement.removeChild(existingMenu)
  }
  clickedElement.appendChild(opmlImportMenu)
  treeActionContext.dialogs.showTransientDialog(clickedElement, opmlImportMenu)
}

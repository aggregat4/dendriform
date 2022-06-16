import './activity-indicator-component' // for side effects
import { OpmlImportDialog } from './dialog-opmlimport'
import { DialogElement } from './dialogs'
import { KbdEventType, KeyboardEventTrigger, NodeClassSelector } from './keyboardshortcut'
import { ExecutableAction, TreeActionContext } from './tree-actions'

export class OpmlImportAction extends ExecutableAction {
  constructor(readonly dialogElement: DialogElement) {
    super(
      new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name')),
      'Import OPML'
    )
  }

  async exec(event: Event, treeActionContext: TreeActionContext) {
    event.stopPropagation()
    treeActionContext.dialogs.showTransientDialog(null, this.dialogElement)
  }
}

customElements.define('df-omplimportdialog', OpmlImportDialog)

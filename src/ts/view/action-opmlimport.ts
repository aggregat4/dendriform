import { TreeActionContext, TreeAction } from './tree-actions'
import { KeyboardEventTrigger, KbdEventType, NodeClassSelector } from './keyboardshortcut'
import { DialogElement } from './dialogs'
import './activity-indicator-component' // for side effects
import { OpmlImportDialog } from './dialog-opmlimport'

export class OpmlImportAction extends TreeAction {
  constructor(readonly dialogElement: DialogElement) {
    super(
      new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name')),
      'Import OPML'
    )
  }

  handle(event: Event, treeActionContext: TreeActionContext): void {
    event.stopPropagation()
    treeActionContext.dialogs.showTransientDialog(null, this.dialogElement)
  }
}

customElements.define('df-omplimportdialog', OpmlImportDialog)

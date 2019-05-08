/**
 * Export of the current subtree in opml format. This offers a file to download, no further UI.
 */
import { KeyboardEventTrigger, KbdEventType, NodeClassSelector } from './keyboardshortcut'
import { TreeAction, TreeActionContext } from './tree-actions'

export const exportOpmlExportAction = new TreeAction(
  new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name')),
  onOpmlExport,
  'Export OPML') // TODO: i18n

function onOpmlExport(event: Event, treeActionContext: TreeActionContext) {
  // generate the XML tree
  // offer to download as a blob
  
}

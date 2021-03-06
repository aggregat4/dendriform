/**
 * Export of the current subtree in opml format. This offers a file to download, no further UI.
 */
import { KeyboardEventTrigger, KbdEventType, NodeClassSelector } from './keyboardshortcut'
import { TreeAction, TreeActionContext } from './tree-actions'
import { repositoryNodeToOpmlDocument } from '../opml/opml-util'
import { saveAs } from 'file-saver'
import { NODE_IS_NOT_DELETED } from '../domain/domain'

export class OpmlExportAction extends TreeAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name')),
      'Export OPML'
    )
  }
  async handle(event: Event, treeActionContext: TreeActionContext): Promise<void> {
    const activeNodeId = treeActionContext.transientStateManager.getActiveNodeId()
    if (activeNodeId) {
      const loadedTree = await treeActionContext.treeService.loadTree(
        activeNodeId,
        NODE_IS_NOT_DELETED,
        true
      )
      const opmlDocument = repositoryNodeToOpmlDocument(loadedTree.tree)
      const serializer = new XMLSerializer()
      const blob = new Blob(
        ['<?xml version="1.0"?>' + serializer.serializeToString(opmlDocument)],
        { type: 'text/plain;charset=utf-8' }
      )
      saveAs(blob, 'dendriform.opml')
    }
  }
}

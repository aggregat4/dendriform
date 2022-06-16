/**
 * Export of the current subtree in opml format. This offers a file to download, no further UI.
 */
import { saveAs } from 'file-saver'
import { repositoryNodeToOpmlDocument } from '../opml/opml-util'
import { NODE_IS_NOT_DELETED } from '../repository/repository'
import { KbdEventType, KeyboardEventTrigger, NodeClassSelector } from './keyboardshortcut'
import { ExecutableAction, TreeActionContext } from './tree-actions'

export class OpmlExportAction extends ExecutableAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name')),
      'Export OPML'
    )
  }

  async exec(event: Event, treeActionContext: TreeActionContext) {
    event.stopPropagation()
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

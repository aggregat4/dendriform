import {
  MergeNameOrder,
  RelativeLinearPosition,
  createNewResolvedRepositoryNode,
  filterNode } from '../domain/domain'
import {
  CloseNodeByIdCommandPayload,
  Command,
  CommandHandler,
  DeleteNodeByIdCommandPayload,
  MergeNodesByIdCommandPayload,
  OpenNodeByIdCommandPayload,
  RenameNodeByIdCommandPayload,
  ReparentNodeByIdCommandPayload,
  SplitNodeByIdCommandPayload,
  UndeleteNodeByIdCommandPayload,
  UpdateNoteByIdCommandPayload} from '../service/service'
import { TreeNode } from './node-component'
import {
  getChildrenElement,
  getChildrenElementOrCreate,
  getNameElement,
  getParentNode,
  getNodeId,
  hasChildren,
  getNoteElement} from './tree-dom-util'

export class DomCommandHandler implements CommandHandler {

  exec(command: Command): Promise<any> {
    const cmd = command.payload
    if (cmd instanceof SplitNodeByIdCommandPayload) {
      this.domSplitNode(
        document.getElementById(cmd.nodeId),
        cmd.newNodeName,
        cmd.remainingNodeName,
        cmd.siblingId)
    } else if (cmd instanceof MergeNodesByIdCommandPayload) {
      this.domMergeNodes(
        document.getElementById(cmd.sourceNodeId),
        cmd.sourceNodeName,
        document.getElementById(cmd.targetNodeId),
        cmd.targetNodeName,
        cmd.mergeNameOrder)
    } else if (cmd instanceof RenameNodeByIdCommandPayload) {
      this.domRenameNode(document.getElementById(cmd.nodeId), cmd.newName)
    } else if (cmd instanceof ReparentNodeByIdCommandPayload) {
      const relativeNode = cmd.position.nodeId ? document.getElementById(cmd.position.nodeId) : null
      const position = relativeNode ? cmd.position.beforeOrAfter : RelativeLinearPosition.END
      this.domReparentNode(
        document.getElementById(cmd.nodeId),
        document.getElementById(cmd.newParentNodeId),
        relativeNode,
        position)
    } else if (cmd instanceof OpenNodeByIdCommandPayload) {
      this.domOpenNode(document.getElementById(cmd.nodeId))
    } else if (cmd instanceof CloseNodeByIdCommandPayload) {
      this.domCloseNode(document.getElementById(cmd.nodeId))
    } else if (cmd instanceof DeleteNodeByIdCommandPayload) {
      this.domDeleteNode(document.getElementById(cmd.nodeId))
    } else if (cmd instanceof UndeleteNodeByIdCommandPayload) {
      // nothing to do, the command should trigger a rerender
    } else if (cmd instanceof UpdateNoteByIdCommandPayload) {
      this.domUpdateNote(document.getElementById(cmd.nodeId), cmd.newNote)
    } else {
      throw new Error(`Unknown Command for DomCommandHandler: ${typeof command.payload}}`)
    }
    return Promise.resolve()
  }

  domMergeNodes(sourceNode: Element, sourceNodeName: string,
                targetNode: Element, targetNodeName: string,
                mergeNameOrder: MergeNameOrder): void {
    // DOM Handling
    // 1. rename targetnode to be targetnode.name + sourcenode.name
    // 2. move all children of sourcenode to targetnode (actual move, just reparent)
    // 3. delete sourcenode
    // 4. focus the new node at the end of its old name
    getNameElement(targetNode).textContent = mergeNameOrder === MergeNameOrder.SOURCE_TARGET ?
      sourceNodeName + targetNodeName : targetNodeName + sourceNodeName
    // Only move source node children if it has any
    // TODO: make this childnodestuff safer with some utility methods
    if (hasChildren(sourceNode)) {
      const targetChildrenNode = getChildrenElementOrCreate(targetNode)
      const sourceChildrenNode = getChildrenElement(sourceNode)
      sourceChildrenNode.childNodes.forEach((childNode, currentIndex, listObj) => {
        targetChildrenNode.appendChild(childNode)
      })
    }
    sourceNode.remove()
  }

  domSplitNode(node: Element, newNodeName: string, originalNodeName: string,
               newNodeId: string): void {
    this.domRenameNode(node, originalNodeName)
    const newNode = createNewResolvedRepositoryNode(newNodeId, newNodeName, getNodeId(getParentNode(node)))
    const newSibling = new TreeNode()
    newSibling.update(filterNode(newNode))
    node.insertAdjacentElement('beforebegin', newSibling.getElement())
  }

  domRenameNode(node: Element, newName: string) {
    getNameElement(node).textContent = newName
  }

  domReparentNode(node: Element, newParentNode: Element,
                  relativeNode: Element, relativePosition: RelativeLinearPosition): void {
    const parentChildrenNode = getChildrenElementOrCreate(newParentNode)
    if (relativePosition === RelativeLinearPosition.BEGINNING) {
      parentChildrenNode.insertBefore(node, parentChildrenNode.firstChild)
    } else if (relativePosition === RelativeLinearPosition.END) {
      parentChildrenNode.appendChild(node)
    } else if (relativePosition === RelativeLinearPosition.BEFORE) {
      relativeNode.insertAdjacentElement('beforebegin', node)
    } else if (relativePosition === RelativeLinearPosition.AFTER) {
      relativeNode.insertAdjacentElement('afterend', node)
    } else {
      throw new Error(`Invalid RelativeLinearPosition: ${relativePosition}`)
    }
  }

  domOpenNode(node: Element): void {
    if (node.classList.contains('closed')) {
      // sadly classList.replace is not widely implemented yet
      node.classList.remove('closed')
      node.classList.add('open')
    }
  }

  domCloseNode(node: Element): void {
    if (node.classList.contains('open')) {
      // sadly classList.replace is not widely implemented yet
      node.classList.remove('open')
      node.classList.add('closed')
    }
  }

  domDeleteNode(node: Element): void {
    node.remove()
  }

  domUpdateNote(node: Element, note: string): void {
    getNoteElement(node).innerHTML = note
  }
}

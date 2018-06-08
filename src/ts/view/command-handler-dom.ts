import {
  LoadedTree,
  RelativeLinearPosition,
  RelativeNodePosition,
  State,
  createNewRepositoryNode,
  createNewResolvedRepositoryNode,
  MergeNameOrder,
  filterNode,
} from '../domain/domain'
import {
  findLastChildNode,
  findNextNode,
  findPreviousNode,
  getNodeId,
  getNodeName,
  getParentNode,
  hasChildren,
  hasParentNode,
  isNameNode,
  isNode,
  getNameElement,
  getNodeForNameElement,
  getChildrenElementOrCreate,
  getChildrenElement} from './tree-dom-util'
import {
  Command,
  CommandBuilder,
  CommandHandler,
  MergeNodesByIdCommandPayload,
  RenameNodeByIdCommandPayload,
  ReparentNodesByIdCommandPayload,
  SplitNodeByIdCommandPayload,
  OpenNodeByIdCommandPayload,
  CloseNodeByIdCommandPayload,
  DeleteNodeByIdCommandPayload,
  UndeleteNodeByIdCommandPayload,
} from '../service/service'
import { TreeNode } from './node-component'
import { setCursorPos } from '../util'

export class DomCommandHandler implements CommandHandler {

  exec(command: Command): Promise<any> {
    if (command.payload instanceof SplitNodeByIdCommandPayload) {
      const splitCommand = command.payload as SplitNodeByIdCommandPayload
      this.domSplitNode(
        document.getElementById(splitCommand.nodeId),
        splitCommand.newNodeName,
        splitCommand.remainingNodeName,
        splitCommand.siblingId)
    } else if (command.payload instanceof MergeNodesByIdCommandPayload) {
      const mergeNodesCommand = command.payload as MergeNodesByIdCommandPayload
      this.domMergeNodes(
        document.getElementById(mergeNodesCommand.sourceNodeId),
        mergeNodesCommand.sourceNodeName,
        document.getElementById(mergeNodesCommand.targetNodeId),
        mergeNodesCommand.targetNodeName,
        mergeNodesCommand.mergeNameOrder)
    } else if (command.payload instanceof RenameNodeByIdCommandPayload) {
      const renameCommand = command.payload as RenameNodeByIdCommandPayload
      this.domRenameNode(document.getElementById(renameCommand.nodeId), renameCommand.newName)
    } else if (command.payload instanceof ReparentNodesByIdCommandPayload) {
      const reparentCommand = command.payload as ReparentNodesByIdCommandPayload
      const relativeNode = reparentCommand.position.nodeId ?
        document.getElementById(reparentCommand.position.nodeId) : null
      const position = relativeNode ?
        reparentCommand.position.beforeOrAfter : RelativeLinearPosition.END
      this.domReparentNode(
        document.getElementById(reparentCommand.nodeId),
        document.getElementById(reparentCommand.newParentNodeId),
        relativeNode,
        position)
    } else if (command.payload instanceof OpenNodeByIdCommandPayload) {
      const openCommand = command.payload as OpenNodeByIdCommandPayload
      this.domOpenNode(document.getElementById(openCommand.nodeId))
    } else if (command.payload instanceof CloseNodeByIdCommandPayload) {
      const closeCommand = command.payload as CloseNodeByIdCommandPayload
      this.domCloseNode(document.getElementById(closeCommand.nodeId))
    } else if (command.payload instanceof DeleteNodeByIdCommandPayload) {
      const deleteCommand = command.payload as DeleteNodeByIdCommandPayload
      this.domDeleteNode(document.getElementById(deleteCommand.nodeId))
    } else if (command.payload instanceof UndeleteNodeByIdCommandPayload) {
      const undeleteCommand = command.payload as UndeleteNodeByIdCommandPayload
      this.domUndeleteNode(document.getElementById(undeleteCommand.nodeId))
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

  domUndeleteNode(node: Element): void {
    // nothing to do, the command triggers a rerender
  }

}

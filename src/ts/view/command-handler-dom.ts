import {CommandHandler} from './command-handler'
import {
  LoadedTree,
  RelativeLinearPosition,
  RelativeNodePosition,
  State,
  createNewRepositoryNode,
  createNewResolvedRepositoryNode,
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
  MergeNodesByIdCommandPayload,
  RenameNodeByIdCommandPayload,
  ReparentNodesByIdCommandPayload,
  SplitNodeByIdCommandPayload,
  UnsplitNodeByIdCommandPayload,
  UnmergeNodesByIdCommandPayload,
  OpenNodeByIdCommandPayload,
  CloseNodeByIdCommandPayload,
} from '../service/service'
import { TreeNode } from './node-component'
import { setCursorPos } from '../util'

export class DomCommandHandler implements CommandHandler {

  exec(command: Command) {
    if (command.payload instanceof SplitNodeByIdCommandPayload) {
      const splitCommand = command.payload as SplitNodeByIdCommandPayload
      this.domSplitNode(
        document.getElementById(splitCommand.nodeId),
        splitCommand.newNodeName,
        splitCommand.remainingNodeName,
        splitCommand.siblingId)
    } else if (command.payload instanceof UnsplitNodeByIdCommandPayload) {
      const unsplitCommand = command.payload as UnsplitNodeByIdCommandPayload
      this.domUnsplitNode(
        document.getElementById(unsplitCommand.originalNodeId),
        document.getElementById(unsplitCommand.newNodeId),
        unsplitCommand.originalName)
    } else if (command.payload instanceof MergeNodesByIdCommandPayload) {
      const mergeNodesCommand = command.payload as MergeNodesByIdCommandPayload
      this.domMergeNodes(
        document.getElementById(mergeNodesCommand.sourceNodeId),
        mergeNodesCommand.sourceNodeName,
        document.getElementById(mergeNodesCommand.targetNodeId),
        mergeNodesCommand.targetNodeName)
    } else if (command.payload instanceof UnmergeNodesByIdCommandPayload) {
      const unmergeCommand = command.payload as UnmergeNodesByIdCommandPayload
      this.domUnmergeNode(
        document.getElementById(unmergeCommand.sourceNodeId),
        unmergeCommand.sourceNodeName,
        unmergeCommand.targetNodeId,
        unmergeCommand.targetNodeName)
    } else if (command.payload instanceof RenameNodeByIdCommandPayload) {
      const renameCommand = command.payload as RenameNodeByIdCommandPayload
      this.domRenameNode(document.getElementById(renameCommand.nodeId), renameCommand.newName)
    } else if (command.payload instanceof ReparentNodesByIdCommandPayload) {
      const reparentCommand = command.payload as ReparentNodesByIdCommandPayload
      const relativeNode = reparentCommand.position.nodeId ?
        document.getElementById(reparentCommand.position.nodeId) : null
      this.domReparentNode(
        document.getElementById(reparentCommand.nodeId),
        document.getElementById(reparentCommand.newParentNodeId),
        relativeNode,
        reparentCommand.position.beforeOrAfter)
    } else if (command.payload instanceof OpenNodeByIdCommandPayload) {
      const openCommand = command.payload as OpenNodeByIdCommandPayload
      this.domOpenNode(document.getElementById(openCommand.nodeId))
    } else if (command.payload instanceof CloseNodeByIdCommandPayload) {
      const closeCommand = command.payload as CloseNodeByIdCommandPayload
      this.domCloseNode(document.getElementById(closeCommand.nodeId))
    }
    if (command.afterFocusNodeId) {
      this.focus(command.afterFocusNodeId, command.afterFocusPos)
    }
  }

  private focus(nodeId: string, charPos: number) {
    const element = document.getElementById(nodeId)
    // tslint:disable-next-line:no-console
    // console.log(`focusing on node ${nodeId} at ${charPos}, exists?`, element)
    if (element) {
      const nameElement: HTMLElement = getNameElement(element) as HTMLElement
      nameElement.focus()
      if (charPos > -1) {
        setCursorPos(nameElement, charPos)
      }
    }
  }

  domMergeNodes(sourceNode: Element, sourceNodeName: string,
                targetNode: Element, targetNodeName: string): void {
    // DOM Handling
    // 1. rename targetnode to be targetnode.name + sourcenode.name
    // 2. move all children of sourcenode to targetnode (actual move, just reparent)
    // 3. delete sourcenode
    // 4. focus the new node at the end of its old name
    getNameElement(targetNode).textContent = targetNodeName + sourceNodeName
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

  domUnmergeNode(mergedNode: Element, originalMergedNodeName: string,
                 otherNodeId: string, otherNodeName: string): void {
    this.domSplitNode(mergedNode, otherNodeName, originalMergedNodeName, otherNodeId)
  }

  domSplitNode(node: Element, newNodeName: string, originalNodeName: string,
               newNodeId: string): void {
    this.domRenameNode(node, originalNodeName)
    const newNode = createNewResolvedRepositoryNode(newNodeId, newNodeName, getNodeId(getParentNode(node)))
    const newSibling = new TreeNode(newNode, false)
    node.insertAdjacentElement('beforebegin', newSibling.getElement())
  }

  domUnsplitNode(originalNode: Element, newNode: Element, originalName: string): void {
    newNode.remove()
    this.domRenameNode(originalNode, originalName)
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

}

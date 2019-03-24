import {
  RelativeLinearPosition,
  createNewResolvedRepositoryNodeWithContent,
} from '../domain/domain'
import { filterNode } from '../domain/domain-search'
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
  UpdateNoteByIdCommandPayload,
  CreateChildNodeCommandPayload,
} from '../commands/commands'
import {MergeNameOrder} from '../service/service'
import {TreeNode} from './node-component'
import {
  getChildrenElement,
  getChildrenElementOrCreate,
  getNameElement,
  hasChildren,
  getNoteElement,
} from './tree-dom-util'

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
      this.domReparentNode(
        document.getElementById(cmd.nodeId),
        document.getElementById(cmd.newParentNodeId),
        relativeNode,
        cmd.position.beforeOrAfter)
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
    } else if (cmd instanceof CreateChildNodeCommandPayload) {
      this.domCreateChildNode(cmd.nodeId, cmd.name, cmd.note, document.getElementById(cmd.parentId))
    } else {
      throw new Error(`Unknown Command for DomCommandHandler: ${typeof command.payload}}`)
    }
    return Promise.resolve()
  }

  private domMergeNodes(sourceNode: Element, sourceNodeName: string,
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
      sourceChildrenNode.childNodes.forEach((childNode) => {
        targetChildrenNode.appendChild(childNode)
      })
    }
    sourceNode.remove()
  }

  private domSplitNode(node: Element, newNodeName: string, originalNodeName: string,
                       newNodeId: string): void {
    this.domRenameNode(node, originalNodeName)
    const newSiblingEl = this.createDomNode(newNodeId, newNodeName, null)
    node.insertAdjacentElement('beforebegin', newSiblingEl)
  }

  private createDomNode(id: string, name: string, note: string): Element {
    const newNode = createNewResolvedRepositoryNodeWithContent(id, name, note)
    const newTreeNode = new TreeNode()
    newTreeNode.update(filterNode(newNode))
    return newTreeNode.getElement()
  }

  private domRenameNode(node: Element, newName: string) {
    getNameElement(node).textContent = newName
  }

  private domReparentNode(node: Element, newParentNode: Element,
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

  private domOpenNode(node: Element): void {
    if (node.classList.contains('closed')) {
      // sadly classList.replace is not widely implemented yet
      node.classList.remove('closed')
      node.classList.add('open')
    }
  }

  private domCloseNode(node: Element): void {
    if (node.classList.contains('open')) {
      // sadly classList.replace is not widely implemented yet
      node.classList.remove('open')
      node.classList.add('closed')
    }
  }

  private domDeleteNode(node: Element): void {
    node.remove()
  }

  private domUpdateNote(node: Element, note: string): void {
    getNoteElement(node).innerHTML = note
  }

  private domCreateChildNode(childId: string, childName: string, childNote: string, parentNode: Element): void {
    const newNode = this.createDomNode(childId, childName, childNote)
    const parentChildrenNode = getChildrenElementOrCreate(parentNode)
    parentChildrenNode.appendChild(newNode)
  }
}

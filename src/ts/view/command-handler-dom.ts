import {
  RelativeLinearPosition,
  createNewResolvedRepositoryNodeWithContent,
  verifyAndRepairMarkup,
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
  CompleteNodeByIdCommandPayload,
  UnCompleteNodeByIdCommandPayload,
} from '../commands/commands'
import { MergeNameOrder } from '../service/service'
import {
  getChildrenElement,
  getChildrenElementOrCreate,
  getNameElement,
  hasChildren,
  getNoteElement,
  hideToggle,
  unhideToggle,
  getParentNode,
} from './tree-dom-util'
import { markupHtml, toHtml } from '../utils/markup'
import { renderNode } from './node-component'
import { render } from 'lit-html'

export class DomCommandHandler implements CommandHandler {
  async exec(command: Command): Promise<void> {
    const cmd = command.payload
    if (cmd instanceof SplitNodeByIdCommandPayload) {
      return this.domSplitNode(
        document.getElementById(cmd.nodeId),
        cmd.newNodeName,
        cmd.remainingNodeName,
        cmd.siblingId
      )
    } else if (cmd instanceof MergeNodesByIdCommandPayload) {
      this.domMergeNodes(
        document.getElementById(cmd.sourceNodeId),
        cmd.sourceNodeName,
        document.getElementById(cmd.targetNodeId),
        cmd.targetNodeName,
        cmd.mergeNameOrder
      )
    } else if (cmd instanceof RenameNodeByIdCommandPayload) {
      this.domRenameNode(document.getElementById(cmd.nodeId), cmd.newName)
    } else if (cmd instanceof ReparentNodeByIdCommandPayload) {
      const relativeNode = cmd.position.nodeId ? document.getElementById(cmd.position.nodeId) : null
      this.domReparentNode(
        document.getElementById(cmd.nodeId),
        document.getElementById(cmd.newParentNodeId),
        relativeNode,
        cmd.position.beforeOrAfter
      )
    } else if (cmd instanceof OpenNodeByIdCommandPayload) {
      this.domOpenNode(document.getElementById(cmd.nodeId))
    } else if (cmd instanceof CloseNodeByIdCommandPayload) {
      this.domCloseNode(document.getElementById(cmd.nodeId))
    } else if (cmd instanceof DeleteNodeByIdCommandPayload) {
      this.domDeleteNode(document.getElementById(cmd.nodeId))
    } else if (cmd instanceof UndeleteNodeByIdCommandPayload) {
      // nothing to do, the command should trigger a rerender
    } else if (cmd instanceof CompleteNodeByIdCommandPayload) {
      this.domCompleteNode(document.getElementById(cmd.nodeId))
    } else if (cmd instanceof UnCompleteNodeByIdCommandPayload) {
      this.domUnCompleteNode(document.getElementById(cmd.nodeId))
    } else if (cmd instanceof UpdateNoteByIdCommandPayload) {
      this.domUpdateNote(document.getElementById(cmd.nodeId), cmd.newNote)
    } else if (cmd instanceof CreateChildNodeCommandPayload) {
      return this.domCreateChildNode(
        cmd.nodeId,
        cmd.name,
        cmd.note,
        document.getElementById(cmd.parentId)
      )
    } else {
      throw new Error(`Unknown Command for DomCommandHandler: ${typeof command.payload}}`)
    }
    return Promise.resolve()
  }

  private domMergeNodes(
    sourceNode: Element,
    sourceNodeName: string,
    targetNode: Element,
    targetNodeName: string,
    mergeNameOrder: MergeNameOrder
  ): void {
    // DOM Handling
    // 1. rename targetnode to be targetnode.name + sourcenode.name
    // 2. move all children of sourcenode to targetnode (actual move, just reparent)
    // 3. delete sourcenode
    // 4. focus the new node at the end of its old name
    mergeNameOrder === MergeNameOrder.SOURCE_TARGET
      ? this.replaceElementWithTaggedContent(
          getNameElement(targetNode),
          sourceNodeName + targetNodeName
        )
      : this.replaceElementWithTaggedContent(
          getNameElement(targetNode),
          targetNodeName + sourceNodeName
        )
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

  private domSplitNode(
    node: Element,
    newNodeName: string,
    originalNodeName: string,
    newNodeId: string
  ): void {
    this.replaceElementWithTaggedContent(getNameElement(node), originalNodeName)
    const newSiblingEl = this.createDomNode(newNodeId, newNodeName, null)
    node.insertAdjacentElement('beforebegin', newSiblingEl)
  }

  private replaceElementWithTaggedContent(el: Element, newName: string): void {
    el.innerHTML = toHtml(markupHtml(newName))
  }

  private createDomNode(id: string, name: string, note: string): Element {
    const newNode = createNewResolvedRepositoryNodeWithContent(id, name, note)
    const el = document.createElement('div')
    render(renderNode(filterNode(newNode), false), el)
    return el.firstElementChild
  }

  /**
   * Renames are handled inline already, but we need to check whether any embeddedLink's
   * texts were changed and if so update the href attribute as well (so links are always
   * correct).
   */
  private domRenameNode(node: Element, newName: string) {
    const nameEl = getNameElement(node)
    verifyAndRepairMarkup(nameEl, newName)
  }

  private domReparentNode(
    node: Element,
    newParentNode: Element,
    relativeNode: Element,
    relativePosition: RelativeLinearPosition
  ): void {
    // save the original parent node for later
    const oldParentNode = getParentNode(node)
    // if we add a new child to a parent we may need to unhide the toggle button on the new parent
    // and hide the toggle button on the old parent
    unhideToggle(newParentNode)
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
      throw new Error(`Invalid RelativeLinearPosition`)
    }
    // we need to check whether the original parent still has children, and if not, hide the toggle (if necessary)
    if (!hasChildren(oldParentNode)) {
      hideToggle(oldParentNode)
    }
  }

  private domOpenNode(node: Element): void {
    if (node.classList.contains('closed')) {
      // sadly classList.replace is not widely implemented yet
      node.classList.remove('closed')
      node.classList.add('open')
      // update child tree with nodes
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
    const noteEl = getNoteElement(node)
    verifyAndRepairMarkup(noteEl, note)
  }

  private domCreateChildNode(
    childId: string,
    childName: string,
    childNote: string,
    parentNode: Element
  ): void {
    const parentChildrenNode = getChildrenElementOrCreate(parentNode)
    const newNode = this.createDomNode(childId, childName, childNote)
    parentChildrenNode.appendChild(newNode)
  }

  private domCompleteNode(node: Element): void {
    node.classList.add('completed-visual-only')
    setTimeout(() => {
      node.classList.add('completed')
      node.classList.remove('completed-visual-only')
    }, 250)
  }

  private domUnCompleteNode(node: Element): void {
    // node can be null in case of undo
    if (node) {
      node.classList.remove('completed')
      node.classList.remove('completed-visual-only')
    }
  }
}

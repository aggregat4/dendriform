import {
  AbstractNodes,
  CloseNodeByIdCommandPayload,
  Command,
  CommandHandler,
  CompleteNodeByIdCommandPayload,
  CreateChildNodeCommandPayload,
  DeleteNodeByIdCommandPayload,
  GoToNodeCommandPayload,
  MergeNodesByIdCommandPayload,
  MoveCursorDownCommandPayload,
  MoveCursorUpCommandPayload,
  NoopCommandPayload,
  OpenNodeByIdCommandPayload,
  RenameNodeByIdCommandPayload,
  ReparentNodeByIdCommandPayload,
  SplitNodeByIdCommandPayload,
  StartEditingNoteCommandPayload,
  TargetNode,
  UnCompleteNodeByIdCommandPayload,
  UndeleteNodeByIdCommandPayload,
  UpdateNoteByIdCommandPayload,
} from '../commands/commands'
import { containsMarkup, markupHtml, toHtml } from '../utils/markup'
import { assert, getCursorPosAcrossMarkup, setCursorPosAcrossMarkup } from '../utils/util'
import { startEditingNote } from './node-component'
import {
  findLastChildNode,
  findNextNode,
  findPreviousNode,
  getNameElement,
  getNoteElement,
} from './tree-dom-util'

export class DomCommandHandler implements CommandHandler {
  async exec(command: Command): Promise<void> {
    const cmd = command.payload
    if (cmd instanceof SplitNodeByIdCommandPayload) {
      // NOOP
    } else if (cmd instanceof MergeNodesByIdCommandPayload) {
      // NOOP
    } else if (cmd instanceof RenameNodeByIdCommandPayload) {
      this.domRenameNode(document.getElementById(cmd.nodeId), cmd.newName)
    } else if (cmd instanceof ReparentNodeByIdCommandPayload) {
      // NOOP
    } else if (cmd instanceof OpenNodeByIdCommandPayload) {
      // NOOP
    } else if (cmd instanceof CloseNodeByIdCommandPayload) {
      // NOOP
    } else if (cmd instanceof DeleteNodeByIdCommandPayload) {
      // NOOP
    } else if (cmd instanceof UndeleteNodeByIdCommandPayload) {
      // nothing to do, the command should trigger a rerender
    } else if (cmd instanceof CompleteNodeByIdCommandPayload) {
      // NOOP
    } else if (cmd instanceof UnCompleteNodeByIdCommandPayload) {
      // NOOP
    } else if (cmd instanceof UpdateNoteByIdCommandPayload) {
      this.domUpdateNote(document.getElementById(cmd.nodeId), cmd.newNote)
    } else if (cmd instanceof CreateChildNodeCommandPayload) {
      // NOOP
    } else if (cmd instanceof StartEditingNoteCommandPayload) {
      return this.startEditingNote(cmd.nodeId)
    } else if (cmd instanceof MoveCursorUpCommandPayload) {
      return this.moveCursorUp(cmd.nodeId)
    } else if (cmd instanceof MoveCursorDownCommandPayload) {
      return this.moveCursorDown(cmd.nodeId)
    } else if (cmd instanceof GoToNodeCommandPayload) {
      return this.goToNode(cmd.newNode, cmd.oldNode)
    } else if (cmd instanceof NoopCommandPayload) {
      // NOOP
    } else {
      throw new Error(`Unknown Command for DomCommandHandler: ${typeof command.payload}}`)
    }
    return Promise.resolve()
  }

  private startEditingNote(nodeId: string): void | PromiseLike<void> {
    const noteElement = getNoteElement(document.getElementById(nodeId)) as HTMLElement
    startEditingNote(noteElement)
  }

  private moveCursorUp(nodeId: string) {
    const nodeElement = document.getElementById(nodeId) as HTMLElement
    const previousNode = findPreviousNode(nodeElement)
    if (previousNode) {
      ;(getNameElement(previousNode) as HTMLElement).focus()
    }
  }

  private moveCursorDown(nodeId: string) {
    const nodeElement = document.getElementById(nodeId) as HTMLElement
    const nextNode = findNextNode(nodeElement)
    if (nextNode) {
      ;(getNameElement(nextNode) as HTMLElement).focus()
    }
  }

  private goToNode(newNode: TargetNode, oldNode: TargetNode) {
    assert(
      !(
        newNode.type !== AbstractNodes.CONCRETE_NODE && oldNode.type !== AbstractNodes.CONCRETE_NODE
      ),
      `both newnode and oldnode can not be beginning or end of the tree`
    )
    if (newNode.type === AbstractNodes.BEGINNING_OF_TREE) {
      const nodeElement = document.getElementById(oldNode.nodeId) as HTMLElement
      const treeDiv = nodeElement.closest('.tree')
      const firstNode = treeDiv.querySelector('div.node div.node')
      if (firstNode) {
        ;(getNameElement(firstNode) as HTMLElement).focus()
      }
    } else if (newNode.type === AbstractNodes.END_OF_TREE) {
      const nodeElement = document.getElementById(oldNode.nodeId) as HTMLElement
      const treeDiv = nodeElement.closest('.tree')
      const rootNode = treeDiv.querySelector('div.node')
      if (rootNode) {
        const lastNode = findLastChildNode(rootNode)
        if (lastNode) {
          ;(getNameElement(lastNode) as HTMLElement).focus()
        }
      }
    } else {
      const targetNode = document.getElementById(newNode.nodeId) as HTMLElement
      if (targetNode) {
        ;(getNameElement(targetNode) as HTMLElement).focus()
      }
    }
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

  private domUpdateNote(node: Element, note: string): void {
    const noteEl = getNoteElement(node)
    verifyAndRepairMarkup(noteEl, note)
  }
}

function updateAllEmbeddedLinks(node: Element): void {
  for (const anchor of node.querySelectorAll('a.embeddedLink')) {
    const anchorText = anchor.textContent
    if (anchor.getAttribute('href') !== anchorText) {
      anchor.setAttribute('href', anchorText)
    }
  }
}

/**
 * Will figure out whether the provided element's contents require something to be
 * marked up (or have markup removed). If it does it will replace the contents of the
 * node and preserve the cursor position in the process.
 *
 * It will also make sure all the embeddedLink elements have the correct href value.
 */
function verifyAndRepairMarkup(el: Element, newText: string): void {
  if (containsMarkup(newText)) {
    const newMarkup = markupHtml(newText)
    const cursorPos = getCursorPosAcrossMarkup(el)
    el.innerHTML = toHtml(newMarkup)
    updateAllEmbeddedLinks(el)
    setCursorPosAcrossMarkup(el, cursorPos)
  }
}

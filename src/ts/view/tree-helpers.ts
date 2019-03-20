import { Command } from '../commands/commands'
import { isNameNode, getClosestNodeElement, getNodeId, getNodeName, getNodeNote } from './tree-dom-util'
import { getCursorPos } from '../util'

export interface CommandExecutor {
  performWithDom(command: Command): void,
  performWithoutDom(command: Command)
}

export class TransientState {
  // Holds transient view state that we need to manage somehow (focus, cursor position, etc)
  readonly transientState = {
    // previous node state so we can undo correctly, this is separate from the actual focus and char pos we want
    focusNodePreviousId: null,
    focusNodePreviousName: null,
    focusNodePreviousNote: null,
    focusNodePreviousPos: -1,
    currentMenuShownTriggerElement: null,
  }
  private activeNodeId: string = null

  savePreviousNodeState(nodeId: string, nodeName: string, nodeNote: string, focusPos: number): void {
    this.transientState.focusNodePreviousId = nodeId
    this.transientState.focusNodePreviousName = nodeName
    this.transientState.focusNodePreviousNote = nodeNote
    this.transientState.focusNodePreviousPos = focusPos
  }

  registerSelectionChangeHandler() {
    // We need to track when the selection changes so we can store the current
    // cursor position (needed for UNDO)
    document.addEventListener('selectionchange', this.selectionChangeHandler.bind(this))
  }

  private selectionChangeHandler(event: Event): void {
    if (document.activeElement) {
      if (isNameNode(document.activeElement)) {
        const activeNode = getClosestNodeElement(document.activeElement)
        this.savePreviousNodeState(
          getNodeId(activeNode),
          getNodeName(activeNode),
          getNodeNote(activeNode),
          getCursorPos())
      }
    }
  }

  getActiveNodeId(): string {
    return this.activeNodeId
  }

  setActiveNodeId(nodeId: string): void {
    this.activeNodeId = nodeId
  }

  getState() {
    return this.transientState
  }
}

import { KbdEventType, RawKbdShortcut, KeyboardEventTrigger, NodeClassSelector, KbdKey, KbdModifier, KbdModifierType, toRawShortCuts, SemanticShortcut, SemanticShortcutType, AllNodesSelector } from './keyboardshortcut'
import { getClosestNodeElement, getNodeId, getNodeName, getNodeNote, findPreviousNode, getNameElement, findNextNode, hasChildren, getParentNode, hasParentNode, findLastChildNode } from './tree-dom-util'
import { getCursorPos, getTextBeforeCursor, getTextAfterCursor, generateUUID, isTextSelected, isCursorAtBeginning, isEmpty, isCursorAtEnd } from '../util'
import { CommandBuilder, RenameNodeByIdCommandPayload, UpdateNoteByIdCommandPayload, SplitNodeByIdCommandPayload, DeleteNodeByIdCommandPayload, MergeNodesByIdCommandPayload, Command, ReparentNodeByIdCommandPayload } from '../commands/commands'
import { MergeNameOrder } from '../service/service'
import { TreeNode } from './node-component'
import { RelativeLinearPosition, RelativeNodePosition } from '../domain/domain'
import { CommandExecutor } from './tree-helpers'
import { TreeAction, TreeActionContext } from './tree-actions'
import { importOpmlAction } from './action-opmlimport'

export class TreeActionRegistry {
  private readonly keyboardActions: Map<KbdEventType, TreeAction[]> = new Map()

  registerKeyboardAction(action: TreeAction): void {
    if (!this.keyboardActions.get(action.trigger.eventType)) {
      this.keyboardActions.set(action.trigger.eventType, [])
    }
    const existingActions = this.keyboardActions.get(action.trigger.eventType)
    existingActions.push(action)
  }

  executeKeyboardActions(eventType: KbdEventType, event: Event, treeActionContext: TreeActionContext): void {
    const actions = this.keyboardActions.get(eventType) || []
    for (const action of actions) {
      if (action.trigger.isTriggered(eventType, event)) {
        action.handler(event, treeActionContext)
      }
    }
  }

}

// TODO: extend the registerKeyboardAction method to take a message key for a name (and maybe a description?) as parameters
// TODO: implement a parser for a text based syntax for keyborad shortcut definition, this is crazy
// TODO: think about a better way to handle the "negative" keyboar shortcut modifiers, for example moving cursor up instead of the node. Maybe just sort by specificity and then the first match wins?
export function registerTreeActions(tree: TreeActionRegistry) {
  tree.registerKeyboardAction(importOpmlAction)
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(KbdEventType.Input, new NodeClassSelector('name')),
      onNameInput,
      'Edit Name'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(KbdEventType.Input, new NodeClassSelector('note')),
      onNoteInput,
      'Edit Note'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keypress,
        new NodeClassSelector('name'),
        [new RawKbdShortcut(KbdKey.Enter, [new KbdModifier(KbdModifierType.Shift, false)])]),
      onNodeSplit,
      'Split Node'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keypress,
        new NodeClassSelector('name'),
        [new RawKbdShortcut(KbdKey.Enter, [new KbdModifier(KbdModifierType.Shift, true)])]),
      onStartNoteEdit,
      'Start Editing Note'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new NodeClassSelector('name'),
        [new RawKbdShortcut(KbdKey.ArrowUp, [new KbdModifier(KbdModifierType.Shift, true), new KbdModifier(KbdModifierType.Alt, true)])]),
      onMoveNodeUp,
      'Move Node Up'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new NodeClassSelector('name'),
        [new RawKbdShortcut(KbdKey.ArrowUp, [new KbdModifier(KbdModifierType.Shift, false), new KbdModifier(KbdModifierType.Alt, false)])]),
      onMoveCursorUp,
      'Move Cursor Up'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new NodeClassSelector('name'),
        [new RawKbdShortcut(KbdKey.ArrowDown, [new KbdModifier(KbdModifierType.Shift, true), new KbdModifier(KbdModifierType.Alt, true)])]),
      onMoveNodeDown,
      'Move Node Down'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new NodeClassSelector('name'),
        [new RawKbdShortcut(KbdKey.ArrowDown, [new KbdModifier(KbdModifierType.Shift, false), new KbdModifier(KbdModifierType.Alt, false)])]),
      onMoveCursorDown,
      'Move Cursor Down'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new NodeClassSelector('name'),
        [new RawKbdShortcut(KbdKey.Backspace, [new KbdModifier(KbdModifierType.Shift, true), new KbdModifier(KbdModifierType.Ctrl, true)])]),
      onDeleteNode,
      'Delete Node'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new NodeClassSelector('name'),
        [new RawKbdShortcut(KbdKey.Backspace, [new KbdModifier(KbdModifierType.Shift, false), new KbdModifier(KbdModifierType.Ctrl, false)])]),
      onBackspaceInName,
      'Potentially Merge With Previous Node'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new NodeClassSelector('name'),
        [new RawKbdShortcut(KbdKey.Delete)]),
      onDeleteInName,
      'Potentially Merge With Next Node'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new NodeClassSelector('name'),
        [new RawKbdShortcut(KbdKey.Tab, [new KbdModifier(KbdModifierType.Shift, false)])]),
      onIndentNode,
      'Indent Node'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new NodeClassSelector('name'),
        [new RawKbdShortcut(KbdKey.Tab, [new KbdModifier(KbdModifierType.Shift, true)])]),
      onUnIndentNode,
      'Unindent Node'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new NodeClassSelector('name'),
        toRawShortCuts(new SemanticShortcut(SemanticShortcutType.BeginningOfDocument))),
      onGotoBeginningOfTree,
      'Go to Beginning of Tree'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new NodeClassSelector('name'),
        toRawShortCuts(new SemanticShortcut(SemanticShortcutType.EndOfDocument))),
      onGotoEndOfTree,
      'Go to End of Tree'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new AllNodesSelector(),
        toRawShortCuts(new SemanticShortcut(SemanticShortcutType.Save))),
      onSaveDocument,
      'Save Document'))
  // TODO: I'm considering moving these undo and redo actions inside of the tree itself, they are a bit the odd ones out
  // they are the only ones requiring the UndoableCommandHandler, and it just feels like an internal implemenation
  // detail and not something that should be registerable from the outside.
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new AllNodesSelector(),
        toRawShortCuts(new SemanticShortcut(SemanticShortcutType.Undo))),
      onUndo,
      'Undo'))
  tree.registerKeyboardAction(
    new TreeAction(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new AllNodesSelector(),
        toRawShortCuts(new SemanticShortcut(SemanticShortcutType.Redo))),
      onRedo,
      'Redo'))
}

function onNameInput(event: Event, treeActionContext: TreeActionContext) {
  const targetNode = getClosestNodeElement((event.target as Element))
  const nodeId = getNodeId(targetNode)
  const newName = getNodeName(targetNode)
  const oldName = treeActionContext.transientStateManager.getState().focusNodePreviousName
  const beforeFocusNodeId = nodeId
  const beforeFocusPos = treeActionContext.transientStateManager.getState().focusNodePreviousPos
  const afterFocusPos = getCursorPos()
  treeActionContext.transientStateManager.savePreviousNodeState(nodeId, newName, getNodeNote(targetNode), afterFocusPos)
  // no dom operation or refresh needed since this is an inline update
  treeActionContext.commandExecutor.performWithoutDom(
    new CommandBuilder(
      new RenameNodeByIdCommandPayload(nodeId, oldName, newName))
      .isUndoable()
      .withBeforeFocusNodeId(beforeFocusNodeId)
      .withBeforeFocusPos(beforeFocusPos)
      .withAfterFocusNodeId(nodeId)
      .withAfterFocusPos(afterFocusPos)
      .build())
}

function onNoteInput(event: Event, treeActionContext: TreeActionContext) {
  const targetNode = getClosestNodeElement((event.target as Element))
  const nodeId = getNodeId(targetNode)
  const name = getNodeName(targetNode)
  const newNote = getNodeNote(targetNode)
  const oldNote = treeActionContext.transientStateManager.getState().focusNodePreviousNote
  const beforeFocusNodeId = nodeId
  const beforeFocusPos = treeActionContext.transientStateManager.getState().focusNodePreviousPos
  const afterFocusPos = getCursorPos()
  treeActionContext.transientStateManager.savePreviousNodeState(nodeId, name, newNote, afterFocusPos)
  // no dom operation or refresh needed since this is an inline update
  treeActionContext.commandExecutor.performWithoutDom(
    new CommandBuilder(
      new UpdateNoteByIdCommandPayload(nodeId, oldNote, newNote))
      .isUndoable()
      .withBeforeFocusNodeId(beforeFocusNodeId)
      .withBeforeFocusPos(beforeFocusPos)
      .withAfterFocusNodeId(nodeId)
      .withAfterFocusPos(afterFocusPos)
      .build())
}

function onNodeSplit(event: Event, treeActionContext: TreeActionContext) {
  event.preventDefault()
  const targetNode = getClosestNodeElement((event.target as Element))
  const nodeId = getNodeId(targetNode)
  const beforeSplitNamePart = getTextBeforeCursor(event) || ''
  const afterSplitNamePart = getTextAfterCursor(event) || ''
  const newNodeId = generateUUID()
  // make sure we save the transientstate so we can undo properly, especially when we split at the end of a node
  treeActionContext.transientStateManager.savePreviousNodeState(nodeId, afterSplitNamePart, getNodeNote(targetNode), 0)
  const command = new CommandBuilder(
    new SplitNodeByIdCommandPayload(newNodeId, nodeId, beforeSplitNamePart,
      afterSplitNamePart, MergeNameOrder.SOURCE_TARGET))
    .isUndoable()
    // The before position and node is used for the after position and node in undo
    .withBeforeFocusNodeId(nodeId)
    .withBeforeFocusPos(getCursorPos())
    .withAfterFocusNodeId(nodeId)
    .withAfterFocusPos(0)
    .build()
  treeActionContext.commandExecutor.performWithDom(command)
}

function onStartNoteEdit(evt: Event, treeActionContext: TreeActionContext) {
  event.preventDefault()
  const noteEl = (event.target as Element).nextElementSibling.nextElementSibling as HTMLElement
  TreeNode.startEditingNote(noteEl)
}

function onMoveNodeUp(event: Event, treeActionContext: TreeActionContext) {
  event.preventDefault()
  const nodeElement = getClosestNodeElement(event.target as Element)
  // this is the combination for moving a node up in its siblings or its parent's previous siblings' children
  // if the current node has siblings before it, then just move it up
  // else if the parent has previous siblings, then move it as a child of the first previous sibling at the end
  treeActionContext.commandExecutor.performWithDom(createMoveNodeUpCommand(nodeElement))
}

function onMoveCursorUp(event: Event, treeActionContext: TreeActionContext) {
  event.preventDefault()
  const nodeElement = getClosestNodeElement(event.target as Element)
  const previousNode = findPreviousNode(nodeElement)
  if (previousNode) {
    (getNameElement(previousNode) as HTMLElement).focus()
  }
}

function onMoveNodeDown(event: Event, treeActionContext: TreeActionContext) {
  event.preventDefault()
  const nodeElement = getClosestNodeElement(event.target as Element)
  // this is the combination for moving a node down in its siblings or its parent's next siblings' children
  // if the current node has siblings after it, then just move it down
  // else if the parent has next siblings, then move it as a child of the first next sibling at the end
  treeActionContext.commandExecutor.performWithDom(createMoveNodeDownCommand(nodeElement))
}

function onMoveCursorDown(event: Event, treeActionContext: TreeActionContext) {
  event.preventDefault()
  const nodeElement = getClosestNodeElement(event.target as Element)
  const nextNode = findNextNode(nodeElement)
  if (nextNode) {
    (getNameElement(nextNode) as HTMLElement).focus()
  }
}

function createMoveNodeDownCommand(nodeElement: Element): Command {
  const parentNodeElement = getParentNode(nodeElement)
  if (nodeElement.nextElementSibling) {
    return createReparentingCommand(
      nodeElement,
      getCursorPos(),
      parentNodeElement,
      parentNodeElement,
      RelativeLinearPosition.AFTER,
      nodeElement.nextElementSibling)
  } else if (parentNodeElement.nextElementSibling) {
    // the node itself has no next siblings, but if its parent has one, we will move it there
    return createReparentingCommand(nodeElement,
      getCursorPos(),
      parentNodeElement,
      parentNodeElement.nextElementSibling,
      RelativeLinearPosition.BEGINNING,
      null)
  }
}

function createMoveNodeUpCommand(nodeElement: Element): Command {
  const parentNodeElement = getParentNode(nodeElement)
  if (nodeElement.previousElementSibling) {
    // we only express relative node positions as being _after_ an existing node
    // so we need to figure out whether there is another node as the previous node's
    // previous sibling, or whether we just need to be at the start of the list
    if (nodeElement.previousElementSibling.previousElementSibling) {
      return createReparentingCommand(
        nodeElement,
        getCursorPos(),
        parentNodeElement,
        parentNodeElement,
        RelativeLinearPosition.AFTER,
        nodeElement.previousElementSibling.previousElementSibling)
    } else {
      return createReparentingCommand(
        nodeElement,
        getCursorPos(),
        parentNodeElement,
        parentNodeElement,
        RelativeLinearPosition.BEGINNING,
        null)
    }
  } else if (parentNodeElement.previousElementSibling) {
    // the node itself has no previous siblings, but if its parent has one, we will move it there
    return createReparentingCommand(
      nodeElement,
      getCursorPos(),
      parentNodeElement,
      parentNodeElement.previousElementSibling,
      RelativeLinearPosition.END,
      null)
  }
}

function createReparentingCommand(node: Element, cursorPos: number, oldParentNode: Element, newParentNode: Element,
                                  relativePosition: RelativeLinearPosition, relativeNode: Element): Command {
  const nodeId = getNodeId(node)
  const oldAfterNodeId = node.previousElementSibling ? getNodeId(node.previousElementSibling) : null
  const oldParentNodeId = getNodeId(oldParentNode)
  const newParentNodeId = getNodeId(newParentNode)
  const position: RelativeNodePosition = {
    nodeId: relativeNode ? getNodeId(relativeNode) : null,
    beforeOrAfter: relativePosition,
  }
  return new CommandBuilder(
    new ReparentNodeByIdCommandPayload(nodeId, oldParentNodeId, oldAfterNodeId, newParentNodeId, position))
    .withBeforeFocusNodeId(nodeId)
    .withBeforeFocusPos(cursorPos)
    .withAfterFocusNodeId(nodeId)
    .withAfterFocusPos(cursorPos)
    .isUndoable()
    .build()
}

function onDeleteNode(event: Event, treeActionContext: TreeActionContext) {
  event.preventDefault()
  const eventNode = getClosestNodeElement(event.target as Element)
  deleteNode(eventNode, treeActionContext.commandExecutor)
}

// TODO: currently we can delete anything, but we don't deal well with deleting the toplevel
// node, perhaps we should just prevent that? When you go to the root node you can delete all
// children anyway?
function deleteNode(node: Element, commandExecutor: CommandExecutor): void {
  const nodeId = getNodeId(node)
  const builder = new CommandBuilder(new DeleteNodeByIdCommandPayload(nodeId))
    .isUndoable()
    .withBeforeFocusNodeId(nodeId)
    .withBeforeFocusPos(getCursorPos())
  const previousNode = findPreviousNode(node)
  // when deleting a node we attempt to set focus afterwards to the previous node in the tree
  // using the same algorithm for moving up and down
  if (previousNode) {
    builder
      .withAfterFocusNodeId(getNodeId(previousNode))
      .withAfterFocusPos(getNodeName(previousNode).length)
  }
  commandExecutor.performWithDom(builder.build())
}

function onBackspaceInName(event: Event, treeActionContext: TreeActionContext) {
  if (!isTextSelected() && isCursorAtBeginning()) {
    const eventNode = getClosestNodeElement(event.target as Element)
    if (isEmpty(getNodeName(eventNode)) && !hasChildren(eventNode)) {
      // this is a special case for convience: when a node is empty and has no
      // children, we interpret backspace as deleting the complete node
      event.preventDefault()
      deleteNode(eventNode, treeActionContext.commandExecutor)
    } else if (getClosestNodeElement(event.target as Element).previousElementSibling) {
      const targetNode = eventNode
      const sourceNode = targetNode.previousElementSibling
      if (hasChildren(sourceNode)) {
        return
      }
      event.preventDefault()
      const sourceNodeId = getNodeId(sourceNode)
      const sourceNodeName = getNodeName(sourceNode)
      const targetNodeId = getNodeId(targetNode)
      const targetNodeName = getNodeName(targetNode)
      const command = new CommandBuilder(
        new MergeNodesByIdCommandPayload(sourceNodeId, sourceNodeName,
          targetNodeId, targetNodeName, MergeNameOrder.SOURCE_TARGET))
        .isUndoable()
        .withBeforeFocusNodeId(targetNodeId)
        .withBeforeFocusPos(0)
        .withAfterFocusNodeId(targetNodeId)
        .withAfterFocusPos(Math.max(0, sourceNodeName.length))
        .build()
      treeActionContext.commandExecutor.performWithDom(command)
    }
  }
}

function onDeleteInName(event: Event, treeActionContext: TreeActionContext) {
  if (!isTextSelected() &&
    isCursorAtEnd(event) &&
    getClosestNodeElement(event.target as Element).nextElementSibling) {
    event.preventDefault()
    const sourceNode = getClosestNodeElement(event.target as Element)
    const targetNode = sourceNode.nextElementSibling
    if (hasChildren(sourceNode)) {
      return
    }
    const sourceNodeId = getNodeId(sourceNode)
    const sourceNodeName = getNodeName(sourceNode)
    const targetNodeId = getNodeId(targetNode)
    const targetNodeName = getNodeName(targetNode)
    const command = new CommandBuilder(
      new MergeNodesByIdCommandPayload(sourceNodeId, sourceNodeName,
        targetNodeId, targetNodeName, MergeNameOrder.SOURCE_TARGET))
      .isUndoable()
      .withBeforeFocusNodeId(sourceNodeId)
      .withBeforeFocusPos(getCursorPos())
      .withAfterFocusNodeId(targetNodeId)
      .withAfterFocusPos(Math.max(0, sourceNodeName.length))
      .build()
    treeActionContext.commandExecutor.performWithDom(command)
  }
}

function onIndentNode(event: Event, treeActionContext: TreeActionContext) {
  // When tabbing you want to make the node the last child of the previous sibling (if it exists)
  const node = getClosestNodeElement(event.target as Element)
  if (node.previousElementSibling) {
    event.preventDefault()
    // when a node is a child, it is inside a "children" container of its parent
    const oldParentNode = getParentNode(node)
    const newParentNode = node.previousElementSibling
    treeActionContext.commandExecutor.performWithDom(createReparentingCommand(node, getCursorPos(), oldParentNode, newParentNode, RelativeLinearPosition.END, null))
  }
}

function onUnIndentNode(event: Event, treeActionContext: TreeActionContext) {
  // When shift-Tabbing the node should become the next sibling of the parent node (if it exists)
  // Caution: we only allow unindent if the current node has a parent and a grandparent node,
  // otherwise we can not unindent
  const node = getClosestNodeElement(event.target as Element)
  if (hasParentNode(node)) {
    const oldParentNode = getParentNode(node)
    if (hasParentNode(oldParentNode)) {
      event.preventDefault()
      const newParentNode = getParentNode(oldParentNode)
      const afterNode = oldParentNode
      treeActionContext.commandExecutor.performWithDom(createReparentingCommand(
        node,
        getCursorPos(),
        oldParentNode,
        newParentNode,
        RelativeLinearPosition.AFTER,
        afterNode))
    }
  }
}

function onGotoBeginningOfTree(event: Event, treeActionContext: TreeActionContext) {
  // Move to the top of the current tree (not the root, but its first child)
  const treeDiv = (event.target as Element).closest('.tree')
  const firstNode = treeDiv.querySelector('div.node div.node')
  if (firstNode) {
    (getNameElement(firstNode) as HTMLElement).focus()
  }
}

function onGotoEndOfTree(event: Event, treeActionContext: TreeActionContext) {
  // Move to the bottom (last leaf node) of the current tree
  const treeDiv = (event.target as Element).closest('.tree')
  const rootNode = treeDiv.querySelector('div.node')
  if (rootNode) {
    const lastNode = findLastChildNode(rootNode)
    if (lastNode) {
      (getNameElement(lastNode) as HTMLElement).focus()
    }
  }
}

function onSaveDocument(event: Event, treeActionContext: TreeActionContext) {
  // suppress saving the page with ctrl s since that is just annoying
  // everything should be saved by now
  event.preventDefault()
}

function onUndo(event: Event, treeActionContext: TreeActionContext) {
  event.preventDefault()
  event.stopPropagation()
  treeActionContext.commandExecutor.performWithDom(treeActionContext.undoCommandHandler.popUndoCommand())
}

function onRedo(event: Event, treeActionContext: TreeActionContext) {
  event.preventDefault()
  event.stopPropagation()
  treeActionContext.commandExecutor.performWithDom(treeActionContext.undoCommandHandler.popRedoCommand())
}

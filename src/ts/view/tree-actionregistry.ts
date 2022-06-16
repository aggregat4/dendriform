import {
  Command,
  CommandBuilder,
  CompleteNodeByIdCommandPayload,
  DeleteNodeByIdCommandPayload,
  MergeNodesByIdCommandPayload,
  RenameNodeByIdCommandPayload,
  ReparentNodeByIdCommandPayload,
  SplitNodeByIdCommandPayload,
  UnCompleteNodeByIdCommandPayload,
  UpdateNoteByIdCommandPayload,
} from '../commands/commands'
import { RelativeLinearPosition, RelativeNodePosition } from '../domain/domain'
import { MergeNameOrder } from '../service/service'
import {
  generateUUID,
  getCursorPos,
  getTextAfterCursor,
  getTextBeforeCursor,
  isCursorAtBeginning,
  isCursorAtEnd,
  isEmpty,
  isTextSelected,
} from '../utils/util'
import {
  AllNodesSelector,
  KbdEventType,
  KbdKey,
  KbdModifier,
  KbdModifierType,
  KeyboardEventTrigger,
  NodeClassSelector,
  RawKbdShortcut,
  SemanticShortcut,
  SemanticShortcutType,
  toRawShortCuts,
} from './keyboardshortcut'
import { startEditingNote } from './node-component'
import {
  CommandCreationAction,
  ExecutableAction,
  TreeAction,
  TreeActionContext,
} from './tree-actions'
import {
  findLastChildNode,
  findNextNode,
  findPreviousNode,
  getClosestNodeElement,
  getNameElement,
  getNodeId,
  getNodeName,
  getNodeNote,
  getParentNode,
  getParentNodeId,
  hasChildren,
  hasParentNode,
  isNodeCompleted,
} from './tree-dom-util'

export class TreeActionRegistry {
  private readonly keyboardActions = new Map<KbdEventType, TreeAction[]>()

  registerKeyboardAction(action: TreeAction): void {
    if (!this.keyboardActions.get(action.trigger.eventType)) {
      this.keyboardActions.set(action.trigger.eventType, [])
    }
    const existingActions = this.keyboardActions.get(action.trigger.eventType)
    existingActions.push(action)
  }

  async executeKeyboardActions(
    eventType: KbdEventType,
    event: Event,
    treeActionContext: TreeActionContext
  ) {
    const actions = this.keyboardActions.get(eventType) || []
    for (const action of actions) {
      if (action.trigger.isTriggered(eventType, event)) {
        if (action instanceof CommandCreationAction) {
          const command = action.createCommand(event, treeActionContext)
          if (command) {
            if (command.payload.requiresRender()) {
              // if we need to rerender the tree after the command, we wait for execution
              // so that no other actions can interleave with it
              await treeActionContext.commandExecutor.performWithDom(command)
            } else {
              // ONLY if we do not require a rerender of the tree do we just async execute the command
              void treeActionContext.commandExecutor.performWithDom(command)
            }
          }
        } else if (action instanceof ExecutableAction) {
          await action.exec(event, treeActionContext)
        }
      }
    }
  }
}

// TODO: think about a better way to handle the "negative" keyboar shortcut modifiers, for example moving cursor up instead of the node. Maybe just sort by specificity and then the first match wins?
// NOTE: not all of these actions should be user configurable, a lot are intrinsic (like enter to break up a node)
export function registerTreeActions(tree: TreeActionRegistry): void {
  // Editing Actions
  tree.registerKeyboardAction(new UpdateNameAction())
  tree.registerKeyboardAction(new UpdateNoteAction())
  tree.registerKeyboardAction(new SplitNodeAction())
  tree.registerKeyboardAction(new MoveNodeUpAction())
  tree.registerKeyboardAction(new MoveNodeDownAction())
  tree.registerKeyboardAction(new DeleteNodeAction())
  tree.registerKeyboardAction(new MergeNodeWithPreviousAction())
  tree.registerKeyboardAction(new MergeNodeWithNextAction())
  tree.registerKeyboardAction(new IndentNodeAction())
  tree.registerKeyboardAction(new UnindentNodeAction())
  tree.registerKeyboardAction(new CompleteNodeAction())
  // Navigation Actions
  tree.registerKeyboardAction(new EditNoteAction())
  tree.registerKeyboardAction(new MoveCursorUpAction())
  tree.registerKeyboardAction(new MoveCursorDownAction())
  tree.registerKeyboardAction(new GotoBeginningOfTreeAction())
  tree.registerKeyboardAction(new GotoEndOfTreeAction())
  tree.registerKeyboardAction(new SaveDocumentAction())
}

class UpdateNameAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Input, new NodeClassSelector('name')),
      'Update Name'
    )
  }

  createCommand(event: Event, treeActionContext: TreeActionContext): Command {
    const targetNode = getClosestNodeElement(event.target as Element)
    const nodeId = getNodeId(targetNode)
    const newName = getNodeName(targetNode)
    const parentNodeId = getParentNodeId(targetNode)
    const oldName = treeActionContext.transientStateManager.getState().focusNodePreviousName
    // const beforeFocusNodeId = nodeId
    // const beforeFocusPos = treeActionContext.transientStateManager.getState().focusNodePreviousPos
    const afterFocusPos = getCursorPos()
    treeActionContext.transientStateManager.savePreviousNodeState(
      nodeId,
      newName,
      getNodeNote(targetNode),
      afterFocusPos
    )
    // the update itself is inline, but we may need to update attributes of other elements like embdeddedLinks
    return new CommandBuilder(
      new RenameNodeByIdCommandPayload(nodeId, parentNodeId, oldName, newName)
    )
      .isUndoable()
      .build()
  }
}

class UpdateNoteAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Input, new NodeClassSelector('note')),
      'Update Note'
    )
  }

  createCommand(event: Event, treeActionContext: TreeActionContext): Command {
    const targetNode = getClosestNodeElement(event.target as Element)
    const nodeId = getNodeId(targetNode)
    const parentNodeId = getParentNodeId(targetNode)
    const name = getNodeName(targetNode)
    const newNote = getNodeNote(targetNode)
    const oldNote = treeActionContext.transientStateManager.getState().focusNodePreviousNote
    const afterFocusPos = getCursorPos()
    treeActionContext.transientStateManager.savePreviousNodeState(
      nodeId,
      name,
      newNote,
      afterFocusPos
    )
    // updates are de facto inline but we may need to update further elements like links
    return new CommandBuilder(
      new UpdateNoteByIdCommandPayload(nodeId, parentNodeId, oldNote, newNote)
    )
      .isUndoable()
      .build()
  }
}

class SplitNodeAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.Enter, [
          new KbdModifier(KbdModifierType.Shift, false),
          new KbdModifier(KbdModifierType.Ctrl, false),
        ]),
      ]),
      'Split Node'
    )
  }

  createCommand(event: Event, treeActionContext: TreeActionContext): Command {
    const targetNode = getClosestNodeElement(event.target as Element)
    const nodeId = getNodeId(targetNode)
    const parentNodeId = getParentNodeId(targetNode)
    const beforeSplitNamePart = getTextBeforeCursor(event) || ''
    const afterSplitNamePart = getTextAfterCursor(event) || ''
    const newNodeId = generateUUID()
    // make sure we save the transientstate so we can undo properly, especially when we split at the end of a node
    treeActionContext.transientStateManager.savePreviousNodeState(
      nodeId,
      afterSplitNamePart,
      getNodeNote(targetNode),
      0
    )
    event.preventDefault()
    const command = new CommandBuilder(
      new SplitNodeByIdCommandPayload(
        newNodeId,
        parentNodeId,
        nodeId,
        parentNodeId,
        beforeSplitNamePart,
        afterSplitNamePart,
        MergeNameOrder.SOURCE_TARGET
      )
    )
      .isUndoable()
      // The before position and node is used for the after position and node in undo
      .withBeforeFocusNodeId(nodeId)
      .withBeforeFocusPos(getCursorPos())
      .withAfterFocusNodeId(nodeId)
      .withAfterFocusPos(0)
      .build()
    console.log(`BORIS creating split command`)
    return command
  }
}

class EditNoteAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.Enter, [new KbdModifier(KbdModifierType.Shift, true)]),
      ]),
      'Start Editing Note'
    )
  }
  createCommand(event: Event): Command {
    event.preventDefault()
    const noteEl = (event.target as Element).nextElementSibling.nextElementSibling as HTMLElement
    startEditingNote(noteEl)
    return null
  }
}

class MoveNodeUpAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.ArrowUp, [
          new KbdModifier(KbdModifierType.Shift, true),
          new KbdModifier(KbdModifierType.Alt, true),
        ]),
      ]),
      'Move Node Up'
    )
  }

  createCommand(event: Event): Command {
    event.preventDefault()
    const nodeElement = getClosestNodeElement(event.target as Element)
    // this is the combination for moving a node up in its siblings or its parent's previous siblings' children
    // if the current node has siblings before it, then just move it up
    // else if the parent has previous siblings, then move it as a child of the first previous sibling at the end
    return createMoveNodeUpCommand(nodeElement)
  }
}

class MoveCursorUpAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.ArrowUp, [
          new KbdModifier(KbdModifierType.Shift, false),
          new KbdModifier(KbdModifierType.Alt, false),
        ]),
      ]),
      'Move Cursor Up'
    )
  }

  createCommand(event: Event): Command {
    event.preventDefault()
    const nodeElement = getClosestNodeElement(event.target as Element)
    const previousNode = findPreviousNode(nodeElement)
    if (previousNode) {
      ;(getNameElement(previousNode) as HTMLElement).focus()
    }
    return null
  }
}

class MoveNodeDownAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.ArrowDown, [
          new KbdModifier(KbdModifierType.Shift, true),
          new KbdModifier(KbdModifierType.Alt, true),
        ]),
      ]),
      'Move Node Down'
    )
  }

  createCommand(event: Event): Command {
    event.preventDefault()
    const nodeElement = getClosestNodeElement(event.target as Element)
    // this is the combination for moving a node down in its siblings or its parent's next siblings' children
    // if the current node has siblings after it, then just move it down
    // else if the parent has next siblings, then move it as a child of the first next sibling at the end
    return createMoveNodeDownCommand(nodeElement)
  }
}

class MoveCursorDownAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.ArrowDown, [
          new KbdModifier(KbdModifierType.Shift, false),
          new KbdModifier(KbdModifierType.Alt, false),
        ]),
      ]),
      'Move Cursor Down'
    )
  }

  createCommand(event: Event): Command {
    event.preventDefault()
    const nodeElement = getClosestNodeElement(event.target as Element)
    const nextNode = findNextNode(nodeElement)
    if (nextNode) {
      ;(getNameElement(nextNode) as HTMLElement).focus()
    }
    return null
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
      nodeElement.nextElementSibling
    )
  } else if (parentNodeElement.nextElementSibling) {
    // the node itself has no next siblings, but if its parent has one, we will move it there
    return createReparentingCommand(
      nodeElement,
      getCursorPos(),
      parentNodeElement,
      parentNodeElement.nextElementSibling,
      RelativeLinearPosition.BEGINNING,
      null
    )
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
        nodeElement.previousElementSibling.previousElementSibling
      )
    } else {
      return createReparentingCommand(
        nodeElement,
        getCursorPos(),
        parentNodeElement,
        parentNodeElement,
        RelativeLinearPosition.BEGINNING,
        null
      )
    }
  } else if (parentNodeElement.previousElementSibling) {
    // the node itself has no previous siblings, but if its parent has one, we will move it there
    return createReparentingCommand(
      nodeElement,
      getCursorPos(),
      parentNodeElement,
      parentNodeElement.previousElementSibling,
      RelativeLinearPosition.END,
      null
    )
  }
}

function createReparentingCommand(
  node: Element,
  cursorPos: number,
  oldParentNode: Element,
  newParentNode: Element,
  relativePosition: RelativeLinearPosition,
  relativeNode: Element
): Command {
  const nodeId = getNodeId(node)
  const oldAfterNodeId = node.previousElementSibling ? getNodeId(node.previousElementSibling) : null
  const oldParentNodeId = getNodeId(oldParentNode)
  const newParentNodeId = getNodeId(newParentNode)
  const position: RelativeNodePosition = {
    nodeId: relativeNode ? getNodeId(relativeNode) : null,
    beforeOrAfter: relativePosition,
  }
  return new CommandBuilder(
    new ReparentNodeByIdCommandPayload(
      nodeId,
      oldParentNodeId,
      oldAfterNodeId,
      newParentNodeId,
      position
    )
  )
    .withBeforeFocusNodeId(nodeId)
    .withBeforeFocusPos(cursorPos)
    .withAfterFocusNodeId(nodeId)
    .withAfterFocusPos(cursorPos)
    .isUndoable()
    .build()
}

class DeleteNodeAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.Backspace, [
          new KbdModifier(KbdModifierType.Shift, true),
          new KbdModifier(KbdModifierType.Ctrl, true),
        ]),
      ]),
      'Delete Node'
    )
  }

  createCommand(event: Event): Command {
    event.preventDefault()
    const eventNode = getClosestNodeElement(event.target as Element)
    return deleteNode(eventNode)
  }
}

function deleteNode(node: Element): Command {
  const nodeId = getNodeId(node)
  const parentNodeId = getParentNodeId(node)
  const builder = new CommandBuilder(new DeleteNodeByIdCommandPayload(nodeId, parentNodeId))
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
  return builder.build()
}

class CompleteNodeAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.Enter, [new KbdModifier(KbdModifierType.Ctrl, true)]),
      ]),
      'Toggle Node Completion'
    )
  }

  createCommand(event: Event): Command {
    const eventNode = getClosestNodeElement(event.target as Element)
    return toggleNodeCompletion(eventNode)
  }
}

function toggleNodeCompletion(node: Element): Command {
  const nodeId = getNodeId(node)
  const parentNodeId = getParentNodeId(node)
  if (isNodeCompleted(node)) {
    const builder = new CommandBuilder(new UnCompleteNodeByIdCommandPayload(nodeId, parentNodeId))
      .isUndoable()
      .withBeforeFocusNodeId(nodeId)
      .withBeforeFocusPos(getCursorPos())
    return builder.build()
  } else {
    let builder = new CommandBuilder(new CompleteNodeByIdCommandPayload(nodeId, parentNodeId))
      .isUndoable()
      .withBeforeFocusNodeId(nodeId)
      .withBeforeFocusPos(getCursorPos())
    // This is the node where we will focus after completing the current node (if there is one)
    const afterFocusNode = findNextNode(node) || findPreviousNode(node)
    if (afterFocusNode) {
      builder = builder.withAfterFocusNodeId(getNodeId(afterFocusNode)).withAfterFocusPos(0)
    }
    return builder.build()
  }
}

class MergeNodeWithPreviousAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.Backspace, [
          new KbdModifier(KbdModifierType.Shift, false),
          new KbdModifier(KbdModifierType.Ctrl, false),
        ]),
      ]),
      'Potentially Merge With Previous Node'
    )
  }

  createCommand(event: Event): Command {
    if (!isTextSelected() && isCursorAtBeginning()) {
      const eventNode = getClosestNodeElement(event.target as Element)
      if (isEmpty(getNodeName(eventNode)) && !hasChildren(eventNode)) {
        // this is a special case for convience: when a node is empty and has no
        // children, we interpret backspace as deleting the complete node
        event.preventDefault()
        return deleteNode(eventNode)
      } else if (getClosestNodeElement(event.target as Element).previousElementSibling) {
        const targetNode = eventNode
        const sourceNode = targetNode.previousElementSibling
        if (hasChildren(sourceNode)) {
          return
        }
        event.preventDefault()
        const sourceNodeId = getNodeId(sourceNode)
        const sourceNodeParentId = getParentNodeId(sourceNode)
        const sourceNodeName = getNodeName(sourceNode)
        const targetNodeId = getNodeId(targetNode)
        const targetNodeParentId = getParentNodeId(targetNode)
        const targetNodeName = getNodeName(targetNode)
        const command = new CommandBuilder(
          new MergeNodesByIdCommandPayload(
            sourceNodeId,
            sourceNodeName,
            sourceNodeParentId,
            targetNodeId,
            targetNodeName,
            targetNodeParentId,
            MergeNameOrder.SOURCE_TARGET
          )
        )
          .isUndoable()
          .withBeforeFocusNodeId(targetNodeId)
          .withBeforeFocusPos(0)
          .withAfterFocusNodeId(targetNodeId)
          .withAfterFocusPos(Math.max(0, sourceNodeName.length))
          .build()
        return command
      }
    }
  }
}

class MergeNodeWithNextAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.Delete),
      ]),
      'Potentially Merge With Next Node'
    )
  }

  createCommand(event: Event): Command {
    if (
      !isTextSelected() &&
      isCursorAtEnd(event) &&
      getClosestNodeElement(event.target as Element).nextElementSibling
    ) {
      event.preventDefault()
      const sourceNode = getClosestNodeElement(event.target as Element)
      const targetNode = sourceNode.nextElementSibling
      if (hasChildren(sourceNode)) {
        return
      }
      const sourceNodeId = getNodeId(sourceNode)
      const sourceNodeName = getNodeName(sourceNode)
      const sourceNodeParentId = getParentNodeId(sourceNode)
      const targetNodeId = getNodeId(targetNode)
      const targetNodeName = getNodeName(targetNode)
      const targetNodeParentId = getParentNodeId(targetNode)
      const command = new CommandBuilder(
        new MergeNodesByIdCommandPayload(
          sourceNodeId,
          sourceNodeName,
          sourceNodeParentId,
          targetNodeId,
          targetNodeName,
          targetNodeParentId,
          MergeNameOrder.SOURCE_TARGET
        )
      )
        .isUndoable()
        .withBeforeFocusNodeId(sourceNodeId)
        .withBeforeFocusPos(getCursorPos())
        .withAfterFocusNodeId(targetNodeId)
        .withAfterFocusPos(Math.max(0, sourceNodeName.length))
        .build()
      return command
    }
  }
}

class IndentNodeAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.Tab, [new KbdModifier(KbdModifierType.Shift, false)]),
      ]),
      'Indent Node'
    )
  }

  createCommand(event: Event): Command {
    // When tabbing you want to make the node the last child of the previous sibling (if it exists)
    const node = getClosestNodeElement(event.target as Element)
    if (node.previousElementSibling) {
      event.preventDefault()
      // when a node is a child, it is inside a "children" container of its parent
      const oldParentNode = getParentNode(node)
      const newParentNode = node.previousElementSibling
      return createReparentingCommand(
        node,
        getCursorPos(),
        oldParentNode,
        newParentNode,
        RelativeLinearPosition.END,
        null
      )
    }
  }
}

class UnindentNodeAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.Tab, [new KbdModifier(KbdModifierType.Shift, true)]),
      ]),
      'Unindent Node'
    )
  }

  createCommand(event: Event): Command {
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
        return createReparentingCommand(
          node,
          getCursorPos(),
          oldParentNode,
          newParentNode,
          RelativeLinearPosition.AFTER,
          afterNode
        )
      }
    }
  }
}

class GotoBeginningOfTreeAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new NodeClassSelector('name'),
        toRawShortCuts(new SemanticShortcut(SemanticShortcutType.BeginningOfDocument))
      ),
      'Go to Beginning of Tree'
    )
  }
  createCommand(event: Event): Command {
    // Move to the top of the current tree (not the root, but its first child)
    const treeDiv = (event.target as Element).closest('.tree')
    const firstNode = treeDiv.querySelector('div.node div.node')
    if (firstNode) {
      ;(getNameElement(firstNode) as HTMLElement).focus()
    }
    return null
  }
}

class GotoEndOfTreeAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new NodeClassSelector('name'),
        toRawShortCuts(new SemanticShortcut(SemanticShortcutType.EndOfDocument))
      ),
      'Go to End of Tree'
    )
  }
  createCommand(event: Event): Command {
    // Move to the bottom (last leaf node) of the current tree
    const treeDiv = (event.target as Element).closest('.tree')
    const rootNode = treeDiv.querySelector('div.node')
    if (rootNode) {
      const lastNode = findLastChildNode(rootNode)
      if (lastNode) {
        ;(getNameElement(lastNode) as HTMLElement).focus()
      }
    }
    return null
  }
}

class SaveDocumentAction extends CommandCreationAction {
  constructor() {
    super(
      new KeyboardEventTrigger(
        KbdEventType.Keydown,
        new AllNodesSelector(),
        toRawShortCuts(new SemanticShortcut(SemanticShortcutType.Save))
      ),
      'Save Document'
    )
  }
  createCommand(event: Event): Command {
    // suppress saving the page with ctrl s since that is just annoying
    // everything should be saved by now
    event.preventDefault()
    return null
  }
}

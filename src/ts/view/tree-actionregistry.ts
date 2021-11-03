import {
  KbdEventType,
  RawKbdShortcut,
  KeyboardEventTrigger,
  NodeClassSelector,
  KbdKey,
  KbdModifier,
  KbdModifierType,
  toRawShortCuts,
  SemanticShortcut,
  SemanticShortcutType,
  AllNodesSelector,
} from './keyboardshortcut'
import {
  getClosestNodeElement,
  getNodeId,
  getNodeName,
  getNodeNote,
  findPreviousNode,
  getNameElement,
  findNextNode,
  hasChildren,
  getParentNode,
  hasParentNode,
  findLastChildNode,
  isNodeCompleted,
  getParentNodeId,
} from './tree-dom-util'
import {
  getCursorPos,
  getTextBeforeCursor,
  getTextAfterCursor,
  generateUUID,
  isTextSelected,
  isCursorAtBeginning,
  isEmpty,
  isCursorAtEnd,
} from '../utils/util'
import {
  CommandBuilder,
  RenameNodeByIdCommandPayload,
  UpdateNoteByIdCommandPayload,
  SplitNodeByIdCommandPayload,
  DeleteNodeByIdCommandPayload,
  MergeNodesByIdCommandPayload,
  Command,
  ReparentNodeByIdCommandPayload,
  UnCompleteNodeByIdCommandPayload,
  CompleteNodeByIdCommandPayload,
} from '../commands/commands'
import { MergeNameOrder } from '../service/service'
import { RelativeLinearPosition, RelativeNodePosition } from '../domain/domain'
import { CommandExecutor } from './tree-helpers'
import { TreeAction, TreeActionContext } from './tree-actions'
import { startEditingNote } from './node-component'

export class TreeActionRegistry {
  private readonly keyboardActions = new Map<KbdEventType, TreeAction[]>()

  registerKeyboardAction(action: TreeAction): void {
    if (!this.keyboardActions.get(action.trigger.eventType)) {
      this.keyboardActions.set(action.trigger.eventType, [])
    }
    const existingActions = this.keyboardActions.get(action.trigger.eventType)
    existingActions.push(action)
  }

  executeKeyboardActions(
    eventType: KbdEventType,
    event: Event,
    treeActionContext: TreeActionContext
  ): void {
    const actions = this.keyboardActions.get(eventType) || []
    for (const action of actions) {
      if (action.trigger.isTriggered(eventType, event)) {
        action.handle(event, treeActionContext)
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

class UpdateNameAction extends TreeAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Input, new NodeClassSelector('name')),
      'Update Name'
    )
  }

  async handle(event: Event, treeActionContext: TreeActionContext) {
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
    await treeActionContext.commandExecutor.performWithDom(
      new CommandBuilder(new RenameNodeByIdCommandPayload(nodeId, parentNodeId, oldName, newName))
        .isUndoable()
        // .withBeforeFocusNodeId(beforeFocusNodeId)
        // .withBeforeFocusPos(beforeFocusPos)
        // .withAfterFocusNodeId(nodeId)
        // .withAfterFocusPos(afterFocusPos)
        .build()
    )
  }
}

class UpdateNoteAction extends TreeAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Input, new NodeClassSelector('note')),
      'Update Note'
    )
  }

  async handle(event: Event, treeActionContext: TreeActionContext) {
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
    await treeActionContext.commandExecutor.performWithDom(
      new CommandBuilder(new UpdateNoteByIdCommandPayload(nodeId, parentNodeId, oldNote, newNote))
        .isUndoable()
        .build()
    )
  }
}

class SplitNodeAction extends TreeAction {
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

  async handle(event: Event, treeActionContext: TreeActionContext) {
    event.preventDefault()
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
    await treeActionContext.commandExecutor.performWithDom(command)
  }
}

class EditNoteAction extends TreeAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keypress, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.Enter, [new KbdModifier(KbdModifierType.Shift, true)]),
      ]),
      'Start Editing Note'
    )
  }
  handle(event: Event, treeActionContext: TreeActionContext) {
    event.preventDefault()
    const noteEl = (event.target as Element).nextElementSibling.nextElementSibling as HTMLElement
    startEditingNote(noteEl)
  }
}

class MoveNodeUpAction extends TreeAction {
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

  async handle(event: Event, treeActionContext: TreeActionContext) {
    event.preventDefault()
    const nodeElement = getClosestNodeElement(event.target as Element)
    // this is the combination for moving a node up in its siblings or its parent's previous siblings' children
    // if the current node has siblings before it, then just move it up
    // else if the parent has previous siblings, then move it as a child of the first previous sibling at the end
    await treeActionContext.commandExecutor.performWithDom(createMoveNodeUpCommand(nodeElement))
  }
}

class MoveCursorUpAction extends TreeAction {
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

  handle(event: Event) {
    event.preventDefault()
    const nodeElement = getClosestNodeElement(event.target as Element)
    const previousNode = findPreviousNode(nodeElement)
    if (previousNode) {
      ;(getNameElement(previousNode) as HTMLElement).focus()
    }
  }
}

class MoveNodeDownAction extends TreeAction {
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

  async handle(event: Event, treeActionContext: TreeActionContext) {
    event.preventDefault()
    const nodeElement = getClosestNodeElement(event.target as Element)
    // this is the combination for moving a node down in its siblings or its parent's next siblings' children
    // if the current node has siblings after it, then just move it down
    // else if the parent has next siblings, then move it as a child of the first next sibling at the end
    await treeActionContext.commandExecutor.performWithDom(createMoveNodeDownCommand(nodeElement))
  }
}

class MoveCursorDownAction extends TreeAction {
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

  handle(event: Event) {
    event.preventDefault()
    const nodeElement = getClosestNodeElement(event.target as Element)
    const nextNode = findNextNode(nodeElement)
    if (nextNode) {
      ;(getNameElement(nextNode) as HTMLElement).focus()
    }
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

class DeleteNodeAction extends TreeAction {
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

  async handle(event: Event, treeActionContext: TreeActionContext) {
    event.preventDefault()
    const eventNode = getClosestNodeElement(event.target as Element)
    await deleteNode(eventNode, treeActionContext.commandExecutor)
  }
}

async function deleteNode(node: Element, commandExecutor: CommandExecutor): Promise<void> {
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
  await commandExecutor.performWithDom(builder.build())
}

class CompleteNodeAction extends TreeAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.Enter, [new KbdModifier(KbdModifierType.Ctrl, true)]),
      ]),
      'Toggle Node Completion'
    )
  }

  async handle(event: Event, treeActionContext: TreeActionContext) {
    const eventNode = getClosestNodeElement(event.target as Element)
    await toggleNodeCompletion(eventNode, treeActionContext.commandExecutor)
  }
}

async function toggleNodeCompletion(node: Element, commandExecutor: CommandExecutor) {
  const nodeId = getNodeId(node)
  const parentNodeId = getParentNodeId(node)
  if (isNodeCompleted(node)) {
    const builder = new CommandBuilder(new UnCompleteNodeByIdCommandPayload(nodeId, parentNodeId))
      .isUndoable()
      .withBeforeFocusNodeId(nodeId)
      .withBeforeFocusPos(getCursorPos())
    await commandExecutor.performWithDom(builder.build())
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
    await commandExecutor.performWithDom(builder.build())
  }
}

class MergeNodeWithPreviousAction extends TreeAction {
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

  async handle(event: Event, treeActionContext: TreeActionContext) {
    if (!isTextSelected() && isCursorAtBeginning()) {
      const eventNode = getClosestNodeElement(event.target as Element)
      if (isEmpty(getNodeName(eventNode)) && !hasChildren(eventNode)) {
        // this is a special case for convience: when a node is empty and has no
        // children, we interpret backspace as deleting the complete node
        event.preventDefault()
        await deleteNode(eventNode, treeActionContext.commandExecutor)
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
        await treeActionContext.commandExecutor.performWithDom(command)
      }
    }
  }
}

class MergeNodeWithNextAction extends TreeAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.Delete),
      ]),
      'Potentially Merge With Next Node'
    )
  }

  async handle(event: Event, treeActionContext: TreeActionContext) {
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
      await treeActionContext.commandExecutor.performWithDom(command)
    }
  }
}

class IndentNodeAction extends TreeAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.Tab, [new KbdModifier(KbdModifierType.Shift, false)]),
      ]),
      'Indent Node'
    )
  }

  async handle(event: Event, treeActionContext: TreeActionContext) {
    // When tabbing you want to make the node the last child of the previous sibling (if it exists)
    const node = getClosestNodeElement(event.target as Element)
    if (node.previousElementSibling) {
      event.preventDefault()
      // when a node is a child, it is inside a "children" container of its parent
      const oldParentNode = getParentNode(node)
      const newParentNode = node.previousElementSibling
      await treeActionContext.commandExecutor.performWithDom(
        createReparentingCommand(
          node,
          getCursorPos(),
          oldParentNode,
          newParentNode,
          RelativeLinearPosition.END,
          null
        )
      )
    }
  }
}

class UnindentNodeAction extends TreeAction {
  constructor() {
    super(
      new KeyboardEventTrigger(KbdEventType.Keydown, new NodeClassSelector('name'), [
        new RawKbdShortcut(KbdKey.Tab, [new KbdModifier(KbdModifierType.Shift, true)]),
      ]),
      'Unindent Node'
    )
  }

  async handle(event: Event, treeActionContext: TreeActionContext) {
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
        await treeActionContext.commandExecutor.performWithDom(
          createReparentingCommand(
            node,
            getCursorPos(),
            oldParentNode,
            newParentNode,
            RelativeLinearPosition.AFTER,
            afterNode
          )
        )
      }
    }
  }
}

class GotoBeginningOfTreeAction extends TreeAction {
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
  handle(event: Event) {
    // Move to the top of the current tree (not the root, but its first child)
    const treeDiv = (event.target as Element).closest('.tree')
    const firstNode = treeDiv.querySelector('div.node div.node')
    if (firstNode) {
      ;(getNameElement(firstNode) as HTMLElement).focus()
    }
  }
}

class GotoEndOfTreeAction extends TreeAction {
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
  handle(event: Event) {
    // Move to the bottom (last leaf node) of the current tree
    const treeDiv = (event.target as Element).closest('.tree')
    const rootNode = treeDiv.querySelector('div.node')
    if (rootNode) {
      const lastNode = findLastChildNode(rootNode)
      if (lastNode) {
        ;(getNameElement(lastNode) as HTMLElement).focus()
      }
    }
  }
}

class SaveDocumentAction extends TreeAction {
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
  handle(event: Event) {
    // suppress saving the page with ctrl s since that is just annoying
    // everything should be saved by now
    event.preventDefault()
  }
}

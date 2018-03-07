import {el, setChildren} from 'redom'
import {
  getCursorPos,
  setCursorPos,
  isCursorAtBeginning,
  isCursorAtEnd,
  getTextBeforeCursor,
  getTextAfterCursor,
  debounce,
  generateUUID,
} from './util'
import {
  findPreviousNameNode,
  findNextNameNode,
  getParentNode,
  hasParentNode,
  getNodeId,
  getNodeName,
  isNode,
  hasChildren,
} from './tree-util'
import {
  Status,
  State,
  RepositoryNode,
  ResolvedRepositoryNode,
  Command,
  CommandBuilder,
  TreeService,
  LoadedTree,
  RelativeNodePosition,
  RelativeLinearPosition,
  SplitNodeByIdCommandPayload,
  RenameNodeByIdCommandPayload,
  MergeNodesByIdCommandPayload,
  ReparentNodesByIdCommandPayload,
} from './tree-api'

interface TransientState {
  focusNodeId: string,
  focusCharPos: number,
  focusNodePreviousId: string,
  focusNodePreviousName: string,
  focusNodePreviousPos: number,
  treeHasBeenNavigatedTo: boolean
}

// Holds transient view state that we need to manage somehow (focus, cursor position, etc)
const transientState: TransientState = {
  focusNodeId: null,
  focusCharPos: -1,
  // previous node state so we can undo correctly, this is separate from the actual focus and char pos we want
  focusNodePreviousId: null,
  focusNodePreviousName: null,
  focusNodePreviousPos: -1,
  treeHasBeenNavigatedTo: false,
}

// We need to track when the selection changes so we can store the current
// cursor position (needed for UNDO)
document.addEventListener('selectionchange', selectionChangeHandler)

function selectionChangeHandler(event: Event): void {
  if (document.activeElement &&
      document.activeElement.parentNode &&
      isNode(document.activeElement.parentElement)) {
    const activeNode = document.activeElement.parentElement
    transientState.focusNodePreviousId = getNodeId(activeNode)
    transientState.focusNodePreviousName = getNodeName(activeNode)
    transientState.focusNodePreviousPos = getCursorPos()
  }
}

export class Tree {
  private el
  private content
  private treeService

  constructor(tree: LoadedTree, treeService: TreeService) {
    this.treeService = treeService
    this.el = el('div.tree',
      this.content = this.contentNode(tree))
  }

  update(tree: LoadedTree) {
    setChildren(this.el, this.contentNode(tree))
  }

  private contentNode(tree: LoadedTree) {
    if (tree.status.state === State.ERROR) {
      return el('div.error', `Can not load tree from backing store: ${tree.status.msg}`)
    } else if (tree.status.state === State.LOADING) {
      return el('div.error', `Loading tree...`)
    } else if (tree.status.state === State.LOADED) {
      return new TreeNode(tree.tree, true, this.treeService)
    }
  }
}

class TreeNode {
  private el
  private anchor
  private name
  private treeService

  constructor(treeNode: ResolvedRepositoryNode, first: boolean, treeService: TreeService) {
    this.treeService = treeService
    this.el = el(
      'div',
      {
        id: treeNode.node._id,
        class: this.genClass(treeNode, first),
      },
      this.anchor = el('a', { href: `#node=${treeNode.node._id}` }, '*'),
      this.name = el('div.name',
        {
          'data-nodeid': treeNode.node._id,
          contentEditable: true,
          // onkeydown
          // afterCreate
          // afterUpdate
        },
        treeNode.node.name),
      treeNode.children && treeNode.children.length > 0 && el('div.children',
          treeNode.children.map(c => new TreeNode(c, false, this.treeService))),
    )
    // We need to bind the event handlers to the class otherwise the scope with the element
    // the event was received on. Javascript! <rolls eyes>
    this.name.addEventListener('input', this.onInput.bind(this))
    this.name.addEventListener('keypress', this.onKeypress.bind(this))
  }

  getElement(): Element {
    return this.el
  }

  private isRoot(node: RepositoryNode): boolean {
    return node._id === 'ROOT'
  }

  private genClass(node: ResolvedRepositoryNode, isFirst: boolean): string {
    return 'node' + (this.isRoot(node.node) ? ' root' : '') + (isFirst ? ' first' : '')
  }

  private onInput(event: Event) {
    const targetNode = (event.target as Element).parentElement
    const nodeId = getNodeId(targetNode)
    const newName = getNodeName(targetNode)
    const oldName = transientState.focusNodePreviousName
    const beforeFocusNodeId = nodeId
    const beforeFocusPos = transientState.focusNodePreviousPos
    transientState.focusNodePreviousId = nodeId
    transientState.focusNodePreviousName = newName
    transientState.focusNodePreviousPos = getCursorPos()
    this.exec(
      new CommandBuilder(
        new RenameNodeByIdCommandPayload(nodeId, oldName, newName))
        .isUndoable()
        .withBeforeFocusNodeId(beforeFocusNodeId)
        .withBeforeFocusPos(beforeFocusPos)
        .build(),
    )
  }

  private onKeypress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      const targetNode = (event.target as Element).parentElement
      const nodeId = getNodeId(targetNode)
      const beforeSplitNamePart = getTextBeforeCursor(event) || ''
      const afterSplitNamePart = getTextAfterCursor(event) || ''
      this.exec(
        new CommandBuilder(
          new SplitNodeByIdCommandPayload(generateUUID(), nodeId, beforeSplitNamePart, afterSplitNamePart))
            .isUndoable()
            .requiresRender()
            .withAfterFocusNodeId(nodeId)
            .build(),
      )
      // The change was saved, now perform the split in the DOM
      const nameNode = (event.target as Element)
      nameNode.textContent = afterSplitNamePart
      const newSibling = new TreeNode(
        this.createNewNode(beforeSplitNamePart, getNodeId(getParentNode(targetNode))),
        false,
        this.treeService)
      targetNode.insertAdjacentElement('beforebegin', newSibling.getElement())
    }
  }

  private createNewNode(name: string, parentref?: string): ResolvedRepositoryNode {
    return {
      node: {
        _id: generateUUID(),
        name,
        content: null,
        childrefs: [],
        parentref,
      },
      children: [],
    }
  }

  private exec(command: Command) {
    this.treeService.exec(command)
    /*.then(() => {
      // no focus handling yet, maybe unnecessary?
       if (command.afterFocusNodeId) {
        requestFocusOnNodeAtChar(command.afterFocusNodeId, command.afterFocusPos)
      }
      if (command.renderRequired) {
        triggerTreeReload()
      }
    })*/
  }

}

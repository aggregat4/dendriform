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
    // We need to bind the event handlers to the class otherwise the scope with the element
    // the event was received on. Javascript! <rolls eyes>
    // Using single event listeners for all nodes to reduce memory usage and the chance of memory leaks
    // This means that all event listeners here need to check whether they are triggered on
    // a relevant node
    this.el.addEventListener('input', this.onInput.bind(this))
    this.el.addEventListener('keypress', this.onKeypress.bind(this))
    this.el.addEventListener('keydown', this.onKeydown.bind(this))
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

  private onInput(event: Event) {
    if (!(event.target as Element).hasAttribute('data-nodeid')) {
      return
    }
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
    if (!(event.target as Element).hasAttribute('data-nodeid')) {
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const targetNode = (event.target as Element).parentElement
      const nodeId = getNodeId(targetNode)
      const beforeSplitNamePart = getTextBeforeCursor(event) || ''
      const afterSplitNamePart = getTextAfterCursor(event) || ''
      const newNode = this.createNewNode(beforeSplitNamePart, getNodeId(getParentNode(targetNode)))
      this.exec(
        new CommandBuilder(
          new SplitNodeByIdCommandPayload(newNode.node._id, nodeId, beforeSplitNamePart, afterSplitNamePart))
            .isUndoable()
            .requiresRender()
            .withAfterFocusNodeId(nodeId)
            .build(),
      )
      // The change was saved, now perform the split in the DOM
      const nameNode = (event.target as Element)
      nameNode.textContent = afterSplitNamePart
      const newSibling = new TreeNode(
        newNode,
        false,
        this.treeService)
      targetNode.insertAdjacentElement('beforebegin', newSibling.getElement())
    }
  }

  private onKeydown(event: KeyboardEvent): void {
    if (!(event.target as Element).hasAttribute('data-nodeid')) {
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (event.shiftKey && event.altKey) {
        // this is the combination for moving a node up in its siblings or its parent's previous siblings' children
        // if the current node has siblings before it, then just move it up
        // else if the parent has previous siblings, then move it as a child of the first previous sibling at the end
        // TODO: implement
        // const nodeElement = (event.target as Element).parentElement
        // debouncedMoveNodeUp(nodeElement)
      } else {
        const previousNameNode = findPreviousNameNode(event.target as Element) as HTMLElement
        if (previousNameNode) {
          this.requestFocusOnNodeAtChar(getNodeId(previousNameNode.parentElement), -1)
          previousNameNode.focus()
        }
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (event.shiftKey && event.altKey) {
        // this is the combination for moving a node down in its siblings or its parent's next siblings' children
        // if the current node has siblings after it, then just move it down
        // else if the parent has next siblings, then move it as a child of the first next sibling at the end
        // TODO: implement
        // const nodeElement = (event.target as Element).parentElement
        // debouncedMoveNodeDown(nodeElement)
      } else {
        const nextNameNode = findNextNameNode(event.target as Element) as HTMLElement
        if (nextNameNode) {
          this.requestFocusOnNodeAtChar(getNodeId(nextNameNode.parentElement), -1)
          nextNameNode.focus()
        }
      }
    }
    // TODO: implement
    /*else if (event.key === 'Backspace') {
      if (isCursorAtBeginning(event) && (event.target as Element).parentElement.previousElementSibling) {
        event.preventDefault()
        const sourceNode = (event.target as Element).parentElement
        const targetNode = sourceNode.previousElementSibling
        mergeNodes(sourceNode, targetNode)
      }
    } else if (event.key === 'Delete') {
      if (isCursorAtEnd(event) && (event.target as Element).parentElement.nextElementSibling) {
        event.preventDefault()
        const targetNode = (event.target as Element).parentElement
        const sourceNode = targetNode.nextElementSibling
        mergeNodes(sourceNode, targetNode)
      }
    } else if (event.key === 'Tab' && !event.shiftKey) {
      // When tabbing you want to make the node the last child of the previous sibling (if it exists)
      const node = (event.target as Element).parentElement
      if (node.previousElementSibling) {
        event.preventDefault()
        // when a node is a child, it is inside a "children" container of its parent
        const oldParentNode = getParentNode(node)
        const newParentNode = node.previousElementSibling
        reparentNode(node, getCursorPos(), oldParentNode, newParentNode)
      }
    } else if (event.key === 'Tab' && event.shiftKey) {
      // When shift-Tabbing the node should become the next sibling of the parent node (if it exists)
      // Caution: we only allow unindent if the current node has a parent and a grandparent node,
      // otherwise we can not unindent
      const node = (event.target as Element).parentElement
      if (hasParentNode(node)) {
        const oldParentNode = getParentNode(node)
        if (hasParentNode(oldParentNode)) {
          const newParentNode = getParentNode(oldParentNode)
          const afterNode = oldParentNode
          event.preventDefault()
          reparentNodeAt(node, getCursorPos(), oldParentNode, newParentNode, RelativeLinearPosition.AFTER, afterNode)
        }
      }
    } */
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

  // charPos should be -1 to just request focus on the node
  private requestFocusOnNodeAtChar(nodeId: string, charPos: number): void {
    transientState.focusNodeId = nodeId
    transientState.focusCharPos = charPos
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

}

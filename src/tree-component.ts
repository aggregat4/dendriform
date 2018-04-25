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
  findLastChildNode,
  getNodeId,
  getNodeName,
  isNode,
  hasChildren,
  isNameNode,
} from './tree-dom-util'
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
  UnsplitNodeByIdCommandPayload,
  UnmergeNodesByIdCommandPayload,
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

// TODO: evaluate whether we need this functionality in the DOM version of this code, this was needed in Maquette
// here we set focus to a node if it has been created and we set it as the focusable node in transientstate
// function transientStateHandler(element: HTMLElement): void {
//   if (transientState && transientState.focusNodeId &&
//       element.getAttribute('data-nodeid') === transientState.focusNodeId) {
//     element.focus()
//     if (transientState.focusCharPos > -1) {
//       setCursorPos(element, transientState.focusCharPos)
//     }
//     transientState.focusNodeId = null
//     transientState.focusCharPos = -1
//   }
// }

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
  private breadcrumbs

  constructor(tree: LoadedTree, treeService: TreeService) {
    this.treeService = treeService
    this.el = el('div.tree',
      this.breadcrumbs = this.generateBreadcrumbs(tree),
      this.content = this.generateTreeNodes(tree))
    // We need to bind the event handlers to the class otherwise the scope with the element
    // the event was received on. Javascript! <rolls eyes>
    // Using one listeners for all nodes to reduce memory usage and the chance of memory leaks
    // This means that all event listeners here need to check whether they are triggered on
    // a relevant node
    this.el.addEventListener('input', this.onInput.bind(this))
    this.el.addEventListener('keypress', this.onKeypress.bind(this))
    this.el.addEventListener('keydown', this.onKeydown.bind(this))
    // We need to support UNDO when activated anywhere in the document
    document.addEventListener('keydown', this.globalKeyDownHandler.bind(this))
  }

  update(tree: LoadedTree) {
    setChildren(this.el,
      this.breadcrumbs = this.generateBreadcrumbs(tree),
      this.content = this.generateTreeNodes(tree))
  }

  private generateBreadcrumbs(tree: LoadedTree) {
    if (!tree.parents || tree.tree.node._id === 'ROOT') {
      return
    } else {
      const fullParents = tree.parents.concat([createNewRepositoryNode('ROOT', 'ROOT')])
      // breadcrumbs need to start at ROOT and go down
      fullParents.reverse()
      return el('div.breadcrumbs',
        fullParents.map(repoNode => el('span', el('a', {href: '#node=' + repoNode._id}, repoNode.name))))
    }
  }

  private generateTreeNodes(tree: LoadedTree) {
    if (tree.status.state === State.ERROR) {
      return el('div.error', `Can not load tree from backing store: ${tree.status.msg}`)
    } else if (tree.status.state === State.LOADING) {
      return el('div.error', `Loading tree...`)
    } else if (tree.status.state === State.LOADED) {
      return new TreeNode(tree.tree, true)
    }
  }

  private onInput(event: Event) {
    if (!isNameNode(event.target as Element)) {
      return
    }
    const targetNode = (event.target as Element).parentElement
    const nodeId = getNodeId(targetNode)
    const newName = getNodeName(targetNode)
    const oldName = transientState.focusNodePreviousName
    const beforeFocusNodeId = nodeId
    const beforeFocusPos = transientState.focusNodePreviousPos
    // TODO: clean up transient state mangement, what do I need still now that we do DOM
    transientState.focusNodePreviousId = nodeId
    transientState.focusNodePreviousName = newName
    transientState.focusNodePreviousPos = getCursorPos()
    // no dom operation needed since this is a rename
    this.exec(
      new CommandBuilder(
        new RenameNodeByIdCommandPayload(nodeId, oldName, newName))
        .isUndoable()
        .build(),
    )
  }

  private onKeypress(event: KeyboardEvent) {
    if (!isNameNode(event.target as Element)) {
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const targetNode = (event.target as Element).parentElement
      const nodeId = getNodeId(targetNode)
      const beforeSplitNamePart = getTextBeforeCursor(event) || ''
      const afterSplitNamePart = getTextAfterCursor(event) || ''
      const newNodeId = generateUUID()
      // make sure we save the transientstate so we can undo properly, especially when we split at the end of a node
      transientState.focusNodePreviousId = nodeId
      transientState.focusNodePreviousName = afterSplitNamePart
      transientState.focusNodePreviousPos = 0
      // we need to save this position before we start manipulating the DOM
      const beforeFocusPos = getCursorPos()
      domSplitNode(targetNode, beforeSplitNamePart, afterSplitNamePart, newNodeId)
      this.exec(
        new CommandBuilder(
          new SplitNodeByIdCommandPayload(newNodeId, nodeId, beforeSplitNamePart, afterSplitNamePart))
            .isUndoable()
            .requiresRender()
            // The before position and node is used for the after position and node in undo
            .withBeforeFocusNodeId(nodeId)
            .withBeforeFocusPos(beforeFocusPos)
            .build(),
      )
    }
  }

  private onKeydown(event: KeyboardEvent): void {
    if (!isNameNode(event.target as Element)) {
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (event.shiftKey && event.altKey) {
        // this is the combination for moving a node up in its siblings or its parent's previous siblings' children
        // if the current node has siblings before it, then just move it up
        // else if the parent has previous siblings, then move it as a child of the first previous sibling at the end
        const nodeElement = (event.target as Element).parentElement
        this.moveNodeUp(nodeElement)
      } else {
        const previousNameNode = findPreviousNameNode(event.target as Element) as HTMLElement
        if (previousNameNode) {
          this.saveTransientState(getNodeId(previousNameNode.parentElement), -1)
          previousNameNode.focus()
        }
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (event.shiftKey && event.altKey) {
        // this is the combination for moving a node down in its siblings or its parent's next siblings' children
        // if the current node has siblings after it, then just move it down
        // else if the parent has next siblings, then move it as a child of the first next sibling at the end
        const nodeElement = (event.target as Element).parentElement
        this.moveNodeDown(nodeElement)
      } else {
        const nextNameNode = findNextNameNode(event.target as Element) as HTMLElement
        if (nextNameNode) {
          this.saveTransientState(getNodeId(nextNameNode.parentElement), -1)
          nextNameNode.focus()
        }
      }
    } else if (event.key === 'Backspace') {
      if (isCursorAtBeginning(event) && (event.target as Element).parentElement.previousElementSibling) {
        event.preventDefault()
        const sourceNode = (event.target as Element).parentElement
        const targetNode = sourceNode.previousElementSibling
        this.mergeNodes(sourceNode, targetNode)
      }
    } else if (event.key === 'Delete') {
      if (isCursorAtEnd(event) && (event.target as Element).parentElement.nextElementSibling) {
        event.preventDefault()
        const targetNode = (event.target as Element).parentElement
        const sourceNode = targetNode.nextElementSibling
        this.mergeNodes(sourceNode, targetNode)
      }
    } else if (event.key === 'Tab' && !event.shiftKey) {
      // When tabbing you want to make the node the last child of the previous sibling (if it exists)
      const node = (event.target as Element).parentElement
      if (node.previousElementSibling) {
        event.preventDefault()
        // when a node is a child, it is inside a "children" container of its parent
        const oldParentNode = getParentNode(node)
        const newParentNode = node.previousElementSibling
        this.reparentNodeAt(node, getCursorPos(), oldParentNode, newParentNode, RelativeLinearPosition.END, null)
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
          this.reparentNodeAt(
            node,
            getCursorPos(),
            oldParentNode,
            newParentNode,
            RelativeLinearPosition.AFTER,
            afterNode)
        }
      }
    } else if (event.key === 'Home' && event.ctrlKey) {
      // Move to the top of the current tree (not the root, but its first child)
      const treeDiv = (event.target as Element).closest('.tree')
      const firstNode = treeDiv.querySelector('div.node div.node')
      if (firstNode) {
        (firstNode.children[1] as HTMLElement).focus()
      }
    } else if (event.key === 'End' && event.ctrlKey) {
      // Move to the bottom (last leaf node) of the current tree
      const treeDiv = (event.target as Element).closest('.tree')
      const rootNode = treeDiv.querySelector('div.node')
      if (rootNode) {
        const lastNode = findLastChildNode(rootNode)
        if (lastNode) {
          (lastNode.children[1] as HTMLElement).focus()
        }
      }
    }
  }

  private moveNodeDown(nodeElement: Element): void {
    const parentNodeElement = getParentNode(nodeElement)
    if (nodeElement.nextElementSibling) {
      this.reparentNodeAt(
        nodeElement,
        getCursorPos(),
        parentNodeElement,
        parentNodeElement,
        RelativeLinearPosition.AFTER,
        nodeElement.nextElementSibling)
    } else if (parentNodeElement.nextElementSibling) {
      // the node itself has no next siblings, but if its parent has one, we will move it there
      this.reparentNodeAt(nodeElement,
        getCursorPos(),
        parentNodeElement,
        parentNodeElement.nextElementSibling,
        RelativeLinearPosition.BEGINNING,
        null)
    }
  }

  private moveNodeUp(nodeElement: Element): void {
    const parentNodeElement = getParentNode(nodeElement)
    if (nodeElement.previousElementSibling) {
      this.reparentNodeAt(
        nodeElement,
        getCursorPos(),
        parentNodeElement,
        parentNodeElement,
        RelativeLinearPosition.BEFORE,
        nodeElement.previousElementSibling)
    } else if (parentNodeElement.previousElementSibling) {
      // the node itself has no previous siblings, but if its parent has one, we will move it there
      this.reparentNodeAt(
        nodeElement,
        getCursorPos(),
        parentNodeElement,
        parentNodeElement.previousElementSibling,
        RelativeLinearPosition.END,
        null)
    }
  }

  private reparentNodeAt(node: Element, cursorPos: number, oldParentNode: Element, newParentNode: Element,
                         relativePosition: RelativeLinearPosition, relativeNode: Element ): void {
    const nodeId = getNodeId(node)
    const oldAfterNodeId = node.previousElementSibling ? getNodeId(node.previousElementSibling) : null
    const oldParentNodeId = getNodeId(oldParentNode)
    const newParentNodeId = getNodeId(newParentNode)
    const position: RelativeNodePosition = {
      beforeOrAfter: relativePosition,
      nodeId: relativeNode ? getNodeId(relativeNode) : null,
    }
    domReparentNode(node, newParentNode, relativeNode, relativePosition)
    this.exec(
      new CommandBuilder(
        new ReparentNodesByIdCommandPayload(nodeId, oldParentNodeId, oldAfterNodeId, newParentNodeId, position))
          .requiresRender()
          .withAfterFocusNodeId(nodeId)
          .withAfterFocusPos(cursorPos)
          .isUndoable()
          .build(),
    )
  }

  // Helper function that works on Nodes, it extracts the ids and names, and then delegates to the other mergenodes
  // Merges are only allowed if the target node has no children
  private mergeNodes(sourceNode: Element, targetNode: Element): void {
    if (hasChildren(targetNode)) {
      return
    }
    const sourceNodeId = getNodeId(sourceNode)
    const sourceNodeName = getNodeName(sourceNode)
    const targetNodeId = getNodeId(targetNode)
    const targetNodeName = getNodeName(targetNode)
    domMergeNodes(sourceNode, sourceNodeName, targetNode, targetNodeName)
    this.exec(
      new CommandBuilder(
        new MergeNodesByIdCommandPayload(sourceNodeId, sourceNodeName, targetNodeId, targetNodeName))
          .isUndoable()
          .requiresRender()
          .withAfterFocusNodeId(targetNodeId)
          .withAfterFocusPos(Math.max(0, targetNodeName.length))
          .build(),
    )
  }

  private exec(command: Command) {
    this.treeService.exec(command)
      .then(() => {
        if (command.afterFocusNodeId) {
          this.focus(command.afterFocusNodeId, command.afterFocusPos)
        }
      })
  }

  private focus(nodeId: string, charPos: number) {
    const element = document.getElementById(nodeId)
    // tslint:disable-next-line:no-console
    // console.log(`focusing on node ${nodeId} at ${charPos}, exists?`, element)
    if (element) {
      const nameElement: HTMLElement = element.children[1] as HTMLElement
      nameElement.focus()
      if (charPos > -1) {
        setCursorPos(nameElement, charPos)
      }
    }
  }

  // charPos should be -1 to just request focus on the node
  private saveTransientState(nodeId: string, charPos: number): void {
    transientState.focusNodeId = nodeId
    transientState.focusCharPos = charPos
  }

  private globalKeyDownHandler(event: KeyboardEvent): void {
    if (event.keyCode === 90 && event.ctrlKey) { // CTRL+Z, so trigger UNDO
      event.preventDefault()
      this.undoLastCommand()
    }
  }

  private undoLastCommand(): void {
    const undoCommandPromise = this.treeService.popUndoCommand()
    if (undoCommandPromise) {
      undoCommandPromise.then((command: Command) => {
        if (command) {
          // DOM Undo Handling
          // TODO: consider moving this to the exec function, then redo is also handled
          // I have not done this here since we currently optimise the actual initial
          // dom operations by using the DOM elements directly, no need to getElementById them all...
          if (command.payload instanceof SplitNodeByIdCommandPayload) {
            const splitCommand = command.payload as SplitNodeByIdCommandPayload
            domSplitNode(
              document.getElementById(splitCommand.nodeId),
              splitCommand.newNodeName,
              splitCommand.remainingNodeName,
              splitCommand.siblingId)
          } else if (command.payload instanceof UnsplitNodeByIdCommandPayload) {
            const unsplitCommand = command.payload as UnsplitNodeByIdCommandPayload
            domUnsplitNode(
              document.getElementById(unsplitCommand.originalNodeId),
              document.getElementById(unsplitCommand.newNodeId),
              unsplitCommand.originalName)
          } else if (command.payload instanceof MergeNodesByIdCommandPayload) {
            const mergeNodesCommand = command.payload as MergeNodesByIdCommandPayload
            domMergeNodes(
              document.getElementById(mergeNodesCommand.sourceNodeId),
              mergeNodesCommand.sourceNodeName,
              document.getElementById(mergeNodesCommand.targetNodeId),
              mergeNodesCommand.targetNodeName)
          } else if (command.payload instanceof UnmergeNodesByIdCommandPayload) {
            const unmergeCommand = command.payload as UnmergeNodesByIdCommandPayload
            domUnmergeNode(
              document.getElementById(unmergeCommand.sourceNodeId),
              unmergeCommand.sourceNodeName,
              unmergeCommand.targetNodeId,
              unmergeCommand.targetNodeName)
          } else if (command.payload instanceof RenameNodeByIdCommandPayload) {
            const renameCommand = command.payload as RenameNodeByIdCommandPayload
            domRenameNode(document.getElementById(renameCommand.nodeId), renameCommand.newName)
          } else if (command.payload instanceof ReparentNodesByIdCommandPayload) {
            const reparentCommand = command.payload as ReparentNodesByIdCommandPayload
            const relativeNode = reparentCommand.position.nodeId ?
              document.getElementById(reparentCommand.position.nodeId) : null
            domReparentNode(
              document.getElementById(reparentCommand.nodeId),
              document.getElementById(reparentCommand.newParentNodeId),
              relativeNode,
              reparentCommand.position.beforeOrAfter)
          }
          this.exec(command)
        }
      })
    } // TODO: REDO Handling!!
  }

}

class TreeNode {
  private el
  private anchor
  private name
  private treeService

  constructor(treeNode: ResolvedRepositoryNode, first: boolean) {
    this.el = el(
      'div',
      {
        id: treeNode.node._id,
        class: this.genClass(treeNode, first),
      },
      this.anchor = el('a', { href: `#node=${treeNode.node._id}` }, '•'), // &#8226;
      this.name = el('div.name',
        { contentEditable: true }, treeNode.node.name),
      treeNode.children && treeNode.children.length > 0 && el('div.children',
          treeNode.children.map(c => new TreeNode(c, false))),
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

// --------------------------------------------------------------------------------------
// ---- DOM Node Operations -------------------------------------------------------------
// --------------------------------------------------------------------------------------

function domMergeNodes(sourceNode: Element, sourceNodeName: string,
                       targetNode: Element, targetNodeName: string): void {
  // DOM Handling
  // 1. rename targetnode to be targetnode.name + sourcenode.name
  // 2. move all children of sourcenode to targetnode (actual move, just reparent)
  // 3. delete sourcenode
  // 4. focus the new node at the end of its old name
  targetNode.children[1].textContent = targetNodeName + sourceNodeName
  // Only move source node children if it has any
  // TODO: make this childnodestuff safer with some utility methods
  if (sourceNode.children.length > 2) {
    if (targetNode.children.length <= 2) {
      targetNode.appendChild(el('div.children'))
    }
    const targetChildrenNode = targetNode.children[2]
    const sourceChildrenNode = sourceNode.children[2]
    sourceChildrenNode.childNodes.forEach((childNode, currentIndex, listObj) => {
      targetChildrenNode.appendChild(childNode)
    })
  }
  sourceNode.remove()
}

function domUnmergeNode(mergedNode: Element, originalMergedNodeName: string,
                        otherNodeId: string, otherNodeName: string): void {
  domSplitNode(mergedNode, otherNodeName, originalMergedNodeName, otherNodeId)
}

function domSplitNode(node: Element, newNodeName: string, originalNodeName: string,
                      newNodeId: string): void {
  domRenameNode(node, originalNodeName)
  const newNode = createNewNode(newNodeId, newNodeName, getNodeId(getParentNode(node)))
  const newSibling = new TreeNode(newNode, false)
  node.insertAdjacentElement('beforebegin', newSibling.getElement())
}

function createNewRepositoryNode(id: string, name: string, parentref?: string): RepositoryNode {
  return {
    _id: id,
    name,
    content: null,
    childrefs: [],
    parentref,
  }
}

function createNewNode(id: string, name: string, parentref?: string): ResolvedRepositoryNode {
  return {
    node: createNewRepositoryNode(id, name, parentref),
    children: [],
  }
}

function domUnsplitNode(originalNode: Element, newNode: Element, originalName: string): void {
  newNode.remove()
  domRenameNode(originalNode, originalName)
}

function domRenameNode(node: Element, newName: string) {
  const nameNode = node.children[1]
  nameNode.textContent = newName
}

function domReparentNode(node: Element, newParentNode: Element,
                         relativeNode: Element, relativePosition: RelativeLinearPosition): void {
  // Children of nodes are hung beneath a dedicated div.children node, so make sure that exists
  if (newParentNode.children.length <= 2) {
    newParentNode.appendChild(el('div.children'))
  }
  const parentChildrenNode = newParentNode.children[2]
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

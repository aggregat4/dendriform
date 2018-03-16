import {h, VNode} from 'maquette'
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
} from './dom-util'
import {
  Status,
  State,
  RepositoryNode,
  ResolvedRepositoryNode,
  Command,
  CommandBuilder,
  TreeService,
  RelativeNodePosition,
  RelativeLinearPosition,
  SplitNodeByIdCommandPayload,
  RenameNodeByIdCommandPayload,
  MergeNodesByIdCommandPayload,
  ReparentNodesByIdCommandPayload,
} from './tree-api'
import {UndoableTreeService} from './tree-manager'
import {LoadedTree} from './repository'

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

const treeService = new UndoableTreeService()
// This is a reference to the currently loaded tree, it is saved so that
// the async vdom render call can get to the current tree
let currentTree: LoadedTree = {status: {state: State.LOADING}}

// We need to support UNDO when activated anywhere in the document
document.addEventListener('keydown', globalKeyDownHandler)
// We need to track when the selection changes so we can store the current
// cursor position (needed for UNDO)
document.addEventListener('selectionchange', selectionChangeHandler)

// TODO: make sure this is ONLY navigation! and refactor signature
export function load(nodeId: string, isNavigation: boolean): Promise<void> {
  transientState.treeHasBeenNavigatedTo = !!isNavigation
  return treeService.loadTree(nodeId)
    .then(tree => {
      currentTree = tree
    })
}

// Virtual DOM nodes need a common parent, otherwise maquette will complain, that's
// one reason why we have the toplevel div.tree
export function render(): VNode {
  return h('div.tree', renderTree(currentTree))
}

function renderTree(tree: LoadedTree): VNode[] {
  switch (tree.status.state) {
    case State.ERROR:   return [h('div.error', [`Can not load tree from backing store: ${tree.status.msg}`])]
    case State.LOADING: return [h('div', [`Loading tree...`])]
    case State.LOADED:  return [renderNode(tree.tree, true)]
    default:            return [h('div.error', [`Tree is in an unknown state`])]
  }
}

function renderNode(resolvedNode: ResolvedRepositoryNode, first: boolean): VNode {
  function isRoot(node: RepositoryNode): boolean {
    return node._id === 'ROOT'
  }
  function renderChildren(children: ResolvedRepositoryNode[]): VNode[]  {
    if (children && children.length > 0) {
      return [h('div.children', children.map(c => renderNode(c, false)))]
    } else {
      return []
    }
  }
  function genClass(node: ResolvedRepositoryNode, isFirst: boolean): string {
    return 'node' + (isRoot(node.node) ? ' root' : '') + (isFirst ? ' first' : '')
  }
  // set focus to the first element of the tree if we have not already requested focus for something else
  if (transientState.treeHasBeenNavigatedTo && !transientState.focusNodeId && !isRoot(resolvedNode.node)) {
    // tslint:disable-next-line:no-console
    console.log(`requesting focus from navigation event main node`)
    requestFocusOnNodeAtChar(resolvedNode.node._id, -1)
    // we only want to force focus on the first element if we have an explicit navigation event,
    // otherwise we would just constantly toggle the focus back to the first node whenever
    // the tree is refreshed, this flag guards against that
    transientState.treeHasBeenNavigatedTo = false
  }
  return h('div',
    {
      id: resolvedNode.node._id,
      key: resolvedNode.node._id + ':' + resolvedNode.node._rev,
      'data-rev': resolvedNode.node._rev,
      class: genClass(resolvedNode, first),
    },
    [
      h('a', { href: `#node=${resolvedNode.node._id}` }, ['*']),
      h('div.name', {
        // this data attribute only exists so that we can focus this node after
        // it has been created in afterCreateHandler, we would like to get it
        // from the parent dom node, but for some reason it is not there yet then
        'data-nodeid': resolvedNode.node._id,
        contentEditable: 'true',
        oninput: nameInputHandler,
        // the keypress event seems to be necessary to intercept (and prevent) the Enter key, input did not work
        onkeypress: nameKeypressHandler,
        onkeydown: nameKeydownHandler,
        // special maquette handlers that get triggered on certain VDOM operations
        afterCreate: transientStateHandler,
        afterUpdate: transientStateHandler,
      }, [resolvedNode.node.name]),
    ].concat(renderChildren(resolvedNode.children)))
}

// as per http://maquettejs.org/docs/typedoc/interfaces/_maquette_.vnodeproperties.html#aftercreate
// here we set focus to a node if it has been created and we set it as the focusable node in transientstate
function transientStateHandler(element: HTMLElement): void {
  if (transientState && transientState.focusNodeId &&
      element.getAttribute('data-nodeid') === transientState.focusNodeId) {
    element.focus()
    if (transientState.focusCharPos > -1) {
      setCursorPos(element, transientState.focusCharPos)
    }
    transientState.focusNodeId = null
    transientState.focusCharPos = -1
  }
}

// When entering a node with the cursor, we need to initialize some transient state
// that is required for implementing UNDO handling. This state is later updated in the
// actual mutating methods, but we need a valid initial (and previous) value
//
// In a sane universe we would use the onfocus event on the node name to track this
// position: this would allow us to very easily set the cursor position just once on
// getting the focus in the node name. HOWEVER it appears that the onfocus event is
// faster than updating the selection and so we get stale values from that approach.
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

function nameInputHandler(event: Event): void {
  const targetNode = (event.target as Element).parentElement
  const nodeId = getNodeId(targetNode)
  const newName = getNodeName(targetNode)
  const oldName = transientState.focusNodePreviousName
  const beforeFocusNodeId = nodeId
  const beforeFocusPos = transientState.focusNodePreviousPos
  transientState.focusNodePreviousId = nodeId
  transientState.focusNodePreviousName = newName
  transientState.focusNodePreviousPos = getCursorPos()
  exec(
    new CommandBuilder(
      new RenameNodeByIdCommandPayload(nodeId, oldName, newName))
      .isUndoable()
      .withBeforeFocusNodeId(beforeFocusNodeId)
      .withBeforeFocusPos(beforeFocusPos)
      .build(),
  )
}

// NOTE from the MDN docs: "The keypress event is fired when a key is pressed down and
// that key normally produces a character value"
function nameKeypressHandler(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    const targetNode = (event.target as Element).parentElement
    const nodeId = getNodeId(targetNode)
    const beforeSplitNamePart = getTextBeforeCursor(event) || ''
    const afterSplitNamePart = getTextAfterCursor(event) || ''
    exec(
      new CommandBuilder(
        new SplitNodeByIdCommandPayload(generateUUID(), nodeId, beforeSplitNamePart, afterSplitNamePart))
          .isUndoable()
          .requiresRender()
          .withAfterFocusNodeId(nodeId)
          .build(),
    )
  }
}

// for reference, Key values: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values
function nameKeydownHandler(event: KeyboardEvent): void {
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (event.shiftKey && event.altKey) {
      // this is the combination for moving a node up in its siblings or its parent's previous siblings' children
      // if the current node has siblings before it, then just move it up
      // else if the parent has previous siblings, then move it as a child of the first previous sibling at the end
      const nodeElement = (event.target as Element).parentElement
      debouncedMoveNodeUp(nodeElement)
    } else {
      const previousNameNode = findPreviousNameNode(event.target as Element) as HTMLElement
      if (previousNameNode) {
        requestFocusOnNodeAtChar(getNodeId(previousNameNode.parentElement), -1)
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
      debouncedMoveNodeDown(nodeElement)
    } else {
      const nextNameNode = findNextNameNode(event.target as Element) as HTMLElement
      if (nextNameNode) {
        requestFocusOnNodeAtChar(getNodeId(nextNameNode.parentElement), -1)
        nextNameNode.focus()
      }
    }
  } else if (event.key === 'Backspace') {
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
  }
}

// debounced versions of these functions so that we don't run into pouchdb update conflicts
const debouncedMoveNodeDown = debounce(moveNodeDown, 25)

function moveNodeDown(nodeElement: Element): void {
  const parentNodeElement = getParentNode(nodeElement)
  if (nodeElement.nextElementSibling) {
    reparentNodeAt(
      nodeElement,
      getCursorPos(),
      parentNodeElement,
      parentNodeElement,
      RelativeLinearPosition.AFTER,
      nodeElement.nextElementSibling)
  } else if (parentNodeElement.nextElementSibling) {
    // the node itself has no next siblings, but if its parent has one, we will move it there
    reparentNodeAt(nodeElement,
      getCursorPos(),
      parentNodeElement,
      parentNodeElement.nextElementSibling,
      RelativeLinearPosition.BEGINNING,
      null)
  }
}

// debounced versions of these functions so that we don't run into pouchdb update conflicts
const debouncedMoveNodeUp = debounce(moveNodeUp, 25)

function moveNodeUp(nodeElement: Element): void {
  const parentNodeElement = getParentNode(nodeElement)
  if (nodeElement.previousElementSibling) {
    reparentNodeAt(
      nodeElement,
      getCursorPos(),
      parentNodeElement,
      parentNodeElement,
      RelativeLinearPosition.BEFORE,
      nodeElement.previousElementSibling)
  } else if (parentNodeElement.previousElementSibling) {
    // the node itself has no previous siblings, but if its parent has one, we will move it there
    reparentNodeAt(
      nodeElement,
      getCursorPos(),
      parentNodeElement,
      parentNodeElement.previousElementSibling,
      RelativeLinearPosition.END,
      null)
  }
}

function globalKeyDownHandler(event: KeyboardEvent): void {
  if (event.keyCode === 90 && event.ctrlKey) { // CTRL+Z, so trigger UNDO
    event.preventDefault()
    const undoCommandPromise = treeService.popUndoCommand()
    if (undoCommandPromise) {
      undoCommandPromise.then((command) => {
        if (command) {
          exec(command)
        }
      })
    } // TODO: REDO Handling!!
  }
}

// Helper function that works on Nodes, it extracts the ids and names, and then delegates to the other mergenodes
// Merges are only allowed if the target node has no children
function mergeNodes(sourceNode: Element, targetNode: Element): void {
  if (hasChildren(targetNode)) {
    return
  }
  const sourceNodeId = getNodeId(sourceNode)
  const sourceNodeName = getNodeName(sourceNode)
  const targetNodeId = getNodeId(targetNode)
  const targetNodeName = getNodeName(targetNode)
  exec(
    new CommandBuilder(
      new MergeNodesByIdCommandPayload(sourceNodeId, sourceNodeName, targetNodeId, targetNodeName))
        .isUndoable()
        .requiresRender()
        .withAfterFocusNodeId(targetNodeId)
        .withAfterFocusPos(Math.max(0, targetNodeName.length))
        .build(),
  )
}

function reparentNode(node: Element, cursorPos: number, oldParentNode: Element, newParentNode: Element): void {
  reparentNodeAt(node, cursorPos, oldParentNode, newParentNode, RelativeLinearPosition.END, null)
}

function reparentNodeAt(node: Element, cursorPos: number, oldParentNode: Element, newParentNode: Element,
                        relativePosition: RelativeLinearPosition, relativeNode: Element ): void {
  const nodeId = getNodeId(node)
  const oldAfterNodeId = node.previousElementSibling ? getNodeId(node.previousElementSibling) : null
  const oldParentNodeId = getNodeId(oldParentNode)
  const newParentNodeId = getNodeId(newParentNode)
  const position: RelativeNodePosition = {
    beforeOrAfter: relativePosition,
    nodeId: relativeNode ? getNodeId(relativeNode) : null,
  }
  exec(
    new CommandBuilder(
      new ReparentNodesByIdCommandPayload(nodeId, oldParentNodeId, oldAfterNodeId, newParentNodeId, position))
        .requiresRender()
        .withAfterFocusNodeId(nodeId)
        .withAfterFocusPos(cursorPos)
        .isUndoable()
        .build(),
  )
}

// charPos should be -1 to just request focus on the node
function requestFocusOnNodeAtChar(nodeId: string, charPos: number): void {
  transientState.focusNodeId = nodeId
  transientState.focusCharPos = charPos
}

function exec(command: Command): void {
  treeService.exec(command).then(() => {
    if (command.afterFocusNodeId) {
      requestFocusOnNodeAtChar(command.afterFocusNodeId, command.afterFocusPos)
    }
    if (command.renderRequired) {
      triggerTreeReload()
    }
  })
}

function triggerTreeReload(): void {
  window.dispatchEvent(new Event('treereload'))
}

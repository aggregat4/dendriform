import { el, setChildren } from 'redom'
import { UndoableCommandHandler } from '../commands/command-handler-undoable'
// tslint:disable-next-line:max-line-length
import { CloseNodeByIdCommandPayload, Command, CommandBuilder, OpenNodeByIdCommandPayload } from '../commands/commands'
// tslint:disable-next-line:max-line-length
import { FilteredRepositoryNode, LoadedTree, State, Subscription } from '../domain/domain'
import { filterNode } from '../domain/domain-search'
import { TreeService } from '../service/tree-service'
// tslint:disable-next-line:max-line-length
import { debounce, getCursorPos, isEmpty, pasteTextUnformatted, setCursorPos } from '../util'
import { DomCommandHandler } from './command-handler-dom'
import { KbdEventType, KeyboardEventTrigger } from './keyboardshortcut'
import { TreeNode } from './node-component'
// tslint:disable-next-line:max-line-length
import { findNoteElementAncestor, getNameElement, getNodeForNameElement, getNodeId, getNodeName, getNodeNote, isInNoteElement, isNameNode, isNodeClosed, isToggleElement, isMenuTriggerElement, isInMenuElement } from './tree-dom-util'

class TreeNodeMenu extends HTMLElement {
  commandExecutor: CommandExecutor
  private testEl: HTMLElement

  constructor() {
    super()
  }

  connectedCallback() {
    if (!this.testEl) {
      this.setAttribute('class', 'menu')

      this.testEl = document.createElement('p')
      this.testEl.innerText = `this is a test.`
      this.append(this.testEl)
      this.testEl.addEventListener('click', (e) => {
        console.log(`clicked on testEl, have a commandExecutor ${this.commandExecutor}`)
      })
    }
  }
}

customElements.define('tree-node-menu', TreeNodeMenu)

export interface CommandExecutor {
  performWithDom(command: Command): void,
  performWithoutDom(command: Command)
}

export class TransientStateManager {
  // Holds transient view state that we need to manage somehow (focus, cursor position, etc)
  readonly transientState = {
    // previous node state so we can undo correctly, this is separate from the actual focus and char pos we want
    focusNodePreviousId: null,
    focusNodePreviousName: null,
    focusNodePreviousNote: null,
    focusNodePreviousPos: -1,
    currentMenuShownTriggerElement: null,
  }

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

  getShownMenuTrigger(): Element {
    return this.transientState.currentMenuShownTriggerElement
  }

  setShownMenuTrigger(element: Element): void {
    this.transientState.currentMenuShownTriggerElement = element
  }

  private selectionChangeHandler(event: Event): void {
    if (document.activeElement && isNameNode(document.activeElement)) {
      const activeNode = getNodeForNameElement(document.activeElement)
      this.savePreviousNodeState(
        getNodeId(activeNode),
        getNodeName(activeNode),
        getNodeNote(activeNode),
        getCursorPos())
    }

  }

  getState() {
    return this.transientState
  }
}

export class KeyboardAction {
  constructor(
    readonly trigger: KeyboardEventTrigger,
    readonly handler: (event: Event, commandExecutor: CommandExecutor, transientStateManager: TransientStateManager, undoCommandHandler: UndoableCommandHandler) => void) {}
}

export class Tree implements CommandExecutor {
  private readonly domCommandHandler = new DomCommandHandler()
  private currentRootNodeId: string
  private el: Element
  private contentEl: Element
  private breadcrumbsEl: Element
  private content: TreeNode
  private searchField
  private treeChangeSubscription: Subscription
  private readonly keyboardActions: Map<KbdEventType, KeyboardAction[]> = new Map()
  private readonly transientStateManager = new TransientStateManager()
  private treeNodeMenu: TreeNodeMenu = null

  // TODO: this treeService is ONLY used for rerendering the tree, does this dependency make sense?
  // should we not only have the command handler?
  constructor(readonly commandHandler: UndoableCommandHandler, readonly treeService: TreeService) {
    this.el = el('div.tree',
      el('div.searchbox',
        /* Removing the search button because we don't really need it. Right? Accesibility?
          this.searchButton = el('button', 'Filter')) */
        this.searchField = el('input', {type: 'search', placeholder: 'Filter'})),
      this.breadcrumbsEl = el('div.breadcrumbs'),
      this.contentEl = el('div.content', el('div.error', `Loading tree...`)))
    // We need to bind the event handlers to the class otherwise the scope is the element
    // the event was received on. Javascript! <rolls eyes>
    // Using one listeners for all nodes to reduce memory usage and the chance of memory leaks
    // This means that all event listeners here need to check whether they are triggered on
    // a relevant node
    this.el.addEventListener('input', this.onInput.bind(this))
    this.el.addEventListener('keypress', this.onKeypress.bind(this))
    this.el.addEventListener('keydown', this.onKeydown.bind(this))
    this.el.addEventListener('click', this.onClick.bind(this))
    this.el.addEventListener('paste', this.onPaste.bind(this))
    this.searchField.addEventListener('input', debounce(this.onQueryChange.bind(this), 150))
    this.transientStateManager.registerSelectionChangeHandler()
    this.treeNodeMenu = document.createElement('tree-node-menu') as TreeNodeMenu
  }

  loadNode(nodeId: string): Promise<any> {
    if (this.treeChangeSubscription) {
      this.treeChangeSubscription.cancel()
      this.treeChangeSubscription = null
    }
    return this.reloadTree(nodeId)
      .then(() => this.treeChangeSubscription = this.treeService.subscribeToChanges(nodeId, this.onBackgroundTreeChange.bind(this)))
  }

  private reloadTree(nodeId: string): Promise<any> {
    return this.treeService.loadTree(nodeId)
      .then(loadedTree => this.update(loadedTree))
  }

  private onBackgroundTreeChange(nodeId: string): void {
    this.reloadTree(this.currentRootNodeId)
  }

  update(tree: LoadedTree) {
    setChildren(this.breadcrumbsEl, this.generateBreadcrumbs(tree))
    if (tree.status.state === State.ERROR) {
      setChildren(this.contentEl,
        el('div.error', `Can not load tree from backing store: ${tree.status.msg}`))
    } else if (tree.status.state === State.LOADING) {
      setChildren(this.contentEl, el('div.error', `Loading tree...`))
    } else if (tree.status.state === State.LOADED) {
      this.currentRootNodeId = tree.tree.node._id
      // TODO: this is currently redoing the complete tree component for each update
      // from another peer. We need this because our RE:DOM components were getting out
      // of sync with the DOM when we do local direct DOM manipulation.
      // The nicer solution is probably to replace RE:DOM with something like
      // incremental DOM and have a complete update of the tree but really incrementally
      // and with patches
      this.content = new TreeNode(true)
      setChildren(this.contentEl, this.content)
      this.content.update(this.getFilteredTree(tree))
    }
  }

  private generateBreadcrumbs(tree: LoadedTree): Element[] {
    if (!tree.ancestors || tree.tree.node._id === 'ROOT') {
      return []
    } else {
      // reverse because breadcrumbs need to start at ROOT and go down
      const fullParents = tree.ancestors.reverse()
      return fullParents.map(repoNode => el('span', el('a', { href: '#node=' + repoNode._id }, repoNode.name)))
    }
  }

  private getFilteredTree(tree: LoadedTree): FilteredRepositoryNode {
    const doFilter = !isEmpty(this.searchField.value)
    return filterNode(tree.tree, doFilter ? {query: this.searchField.value} : undefined)
  }

  registerKeyboardAction(action: KeyboardAction): void {
    if (!this.keyboardActions.get(action.trigger.eventType)) {
      this.keyboardActions.set(action.trigger.eventType, [])
    }
    const existingActions = this.keyboardActions.get(action.trigger.eventType)
    existingActions.push(action)
  }

  private executeKeyboardActions(eventType: KbdEventType, event: Event): void {
    const actions = this.keyboardActions.get(eventType) || []
    for (const action of actions) {
      if (action.trigger.isTriggered(eventType, event)) {
        action.handler(event, this, this.transientStateManager, this.commandHandler)
      }
    }
  }

  private onClick(event: Event): void {
    const clickedElement = event.target as Element
    this.dismissMenuIfNeeded(event)
    if (isToggleElement(clickedElement)) {
      event.preventDefault()
      // NOTE: we can use the getNodeForNameElement function even though this is the
      // collapseElement because they are siblings
      const node = getNodeForNameElement(clickedElement)
      const payload = isNodeClosed(node)
        ? new OpenNodeByIdCommandPayload(getNodeId(node))
        : new CloseNodeByIdCommandPayload(getNodeId(node))
      this.performWithDom(new CommandBuilder(payload).isUndoable().build())
    } else if (isInNoteElement(clickedElement)) {
      // for a note we need to take into account that a note may have its own markup (hence isInNoteElement)
      const noteElement = findNoteElementAncestor(clickedElement) as HTMLElement
      if (! noteElement.isContentEditable) {
        event.preventDefault()
        TreeNode.startEditingNote(noteElement as HTMLElement)
      }
    } else if (isMenuTriggerElement(clickedElement)) {
      this.showMenu(clickedElement)
    }
  }

  private dismissMenuIfNeeded(event: Event): void {
    const clickedElement = event.target as Element
    if (this.transientStateManager.getShownMenuTrigger() &&
        (!isMenuTriggerElement(clickedElement) || this.transientStateManager.getShownMenuTrigger() !== clickedElement) &&
        !isInMenuElement(clickedElement)) {
      // dismiss popup
      this.transientStateManager.getShownMenuTrigger().setAttribute('aria-expanded', 'false')
      this.transientStateManager.setShownMenuTrigger(null)
      // destroy menu...
      this.treeNodeMenu.commandExecutor = null
      this.treeNodeMenu.style.display = 'none'
    }
  }

  private showMenu(menuTrigger: Element): void {
    if (menuTrigger === this.transientStateManager.getShownMenuTrigger()) {
      return
    }
    // set aria-expanded to true and save transient state
    this.transientStateManager.setShownMenuTrigger(menuTrigger)
    menuTrigger.setAttribute('aria-expanded', 'true')
    // TODO: menu is a bigger thing. It is dynamic (contents depend on node)
    // it can be shown for all nodes
    // it has to trigger real actions (see tree-actions)
    // it has to interact with the tree itself, specifically regarding state
    this.treeNodeMenu.commandExecutor = this
    menuTrigger.parentElement.append(this.treeNodeMenu)
    this.treeNodeMenu.style.display = 'block'
  }

  private onPaste(event: ClipboardEvent): void {
    // We don't want any formatted HTML pasted in our nodes.
    // Inside a note we can be inside some child HTML tags, so we need to to a more thorough check
    if (isNameNode(event.target as Element) || isInNoteElement(event.target as Element)) {
      event.preventDefault()
      pasteTextUnformatted(event)
    }
  }

  private onQueryChange(event: Event) {
    this.rerenderTree()
  }

  private rerenderTree(): Promise<any> {
    return this.loadNode(this.currentRootNodeId)
  }

  private onInput(event: Event) {
    // apparently we can get some fancy newfangled input events we may want to ignore
    // see https://www.w3.org/TR/input-events-1/
    if ((event as any).inputType === 'historyUndo' ||
        (event as any).inputType === 'historyRedo') {
      return
    }
    this.executeKeyboardActions(KbdEventType.Input, event)
  }

  private onKeypress(event: KeyboardEvent) {
    this.executeKeyboardActions(KbdEventType.Keypress, event)
  }

  private onKeydown(event: KeyboardEvent): void {
    this.executeKeyboardActions(KbdEventType.Keydown, event)
  }

  performWithoutDom(command: Command): void {
    this.commandHandler.exec(command)
  }

  performWithDom(command: Command): void {
    if (command) {
      this.domCommandHandler.exec(command)
      const commandPromise = this.commandHandler.exec(command)
      // If a command requires a rerender this means we need to reload the tree
      // and then let Redom efficiently update all the nodes, however if we need
      // to focus afterwards, we need to be careful to do this after having loaded
      // the tree
      if (command.payload.requiresRender()) {
        commandPromise.then(this.rerenderTree.bind(this)).then(() => {
          if (command.afterFocusNodeId) {
            this.focus(command.afterFocusNodeId, command.afterFocusPos)
          }
        })
      } else  {
        if (command.afterFocusNodeId) {
          this.focus(command.afterFocusNodeId, command.afterFocusPos)
        }
      }
    }
  }

  private focus(nodeId: string, charPos: number) {
    const element = document.getElementById(nodeId)
    // tslint:disable-next-line:no-console
    // console.log(`focusing on node ${nodeId} at ${charPos}, exists?`, element)
    if (element) {
      const nameElement: HTMLElement = getNameElement(element) as HTMLElement
      nameElement.focus()
      if (charPos > -1) {
        setCursorPos(nameElement, charPos)
      }
    }
  }

}

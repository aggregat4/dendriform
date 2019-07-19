import { el, setChildren, RedomElement, RedomComponent } from 'redom'
import { UndoableCommandHandler } from '../commands/command-handler-undoable'
// tslint:disable-next-line:max-line-length
import { CloseNodeByIdCommandPayload, Command, CommandBuilder, OpenNodeByIdCommandPayload } from '../commands/commands'
// tslint:disable-next-line:max-line-length
import { FilteredRepositoryNode, LoadedTree, State, Subscription, ActivityIndicating, Filter, NODE_IS_NOT_DELETED, NODE_NOT_DELETED_AND_NOT_COMPLETED, RepositoryNode, NODE_IS_NOT_COLLAPSED, NODE_IS_NOT_COMPLETED } from '../domain/domain'
import { filterNode, parseQuery } from '../domain/domain-search'
import { TreeService } from '../service/tree-service'
// tslint:disable-next-line:max-line-length
import { debounce, isEmpty, pasteTextUnformatted, setCursorPos, Predicate, createCompositeAndPredicate } from '../utils/util'
import { DomCommandHandler } from './command-handler-dom'
import { KbdEventType, KeyboardEventTrigger, AllNodesSelector, toRawShortCuts, SemanticShortcut, SemanticShortcutType } from './keyboardshortcut'
import { TreeNode } from './node-component'
// tslint:disable-next-line:max-line-length
import { findNoteElementAncestor, getNameElement, getClosestNodeElement, getNodeId, isInNoteElement, isNameNode, isNodeClosed, isToggleElement, isMenuTriggerElement, isEmbeddedLink, isInNameNode, isFilterTag, extractFilterText } from './tree-dom-util'
import { TreeActionContext } from './tree-actions'
import { CommandExecutor, TransientState } from './tree-helpers'
import { TreeNodeMenu, TreeNodeActionMenuItem, TreeNodeInfoMenuItem } from './tree-menu-component'
import { TreeActionRegistry } from './tree-actionregistry'
import { Dialogs, Dialog } from './dialogs'
import { ActivityIndicator } from './activity-indicator-component'

import { importOpmlAction } from './action-opmlimport'
import { exportOpmlExportAction } from './action-opmlexport'

customElements.define('treenode-menu', TreeNodeMenu)
customElements.define('treenode-menuitem-action', TreeNodeActionMenuItem)
customElements.define('treenode-menuitem-info', TreeNodeInfoMenuItem)

class TreeConfig {
  showCompleted: boolean = false
}

export class Tree implements CommandExecutor, RedomComponent {
  private readonly domCommandHandler = new DomCommandHandler()
  private currentRootNodeId: string
  private contentEl: Element
  private breadcrumbsEl: Element
  private dialogOverlayEl: Element
  private content: TreeNode
  private searchField: HTMLInputElement
  private showCompletedCheckbox: HTMLInputElement
  private treeChangeSubscription: Subscription
  private readonly transientStateManager = new TransientState()
  private treeNodeMenu: TreeNodeMenu = null
  private treeActionContext: TreeActionContext = null
  private dialogs: Dialogs = null
  private config: TreeConfig = new TreeConfig()
  private currentFilterQuery: string = ''
  // We handle undo and redo internally since they are core functionality we don't want to make generic and overwritable
  private readonly undoTrigger = new KeyboardEventTrigger(KbdEventType.Keydown, new AllNodesSelector(), toRawShortCuts(new SemanticShortcut(SemanticShortcutType.Undo)))
  private readonly redoTrigger = new KeyboardEventTrigger(KbdEventType.Keydown, new AllNodesSelector(), toRawShortCuts(new SemanticShortcut(SemanticShortcutType.Redo)))

  // For REDOM
  el: HTMLElement

  // TODO: this treeService is ONLY used for rerendering the tree, does this dependency make sense?
  // should we not only have the command handler?
  constructor(readonly commandHandler: UndoableCommandHandler, readonly treeService: TreeService, readonly treeActionRegistry: TreeActionRegistry, readonly activityIndicating: ActivityIndicating) {
    const activityIndicator = new ActivityIndicator(activityIndicating, 1000)
    this.el = el(`div.tree${this.generateTreeClasses()}`,
      el('div.searchbox',
        /* Removing the search button because we don't really need it. Right? Accesibility?
          this.searchButton = el('button', 'Filter')) */
        this.searchField = el('input', {type: 'search', placeholder: 'Filter'}) as HTMLInputElement,
        activityIndicator,
        el('fieldset.config',
          el('label',
            this.showCompletedCheckbox = el('input', this.config.showCompleted ? {type: 'checkbox', checked: ''} : {type: 'checkbox'}),
            'Show Completed'))),
      this.breadcrumbsEl = el('div.breadcrumbs'),
      this.contentEl = el('div.content', el('div.error', `Loading tree...`)),
      this.dialogOverlayEl = el('div.dialogOverlay'))
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
    this.showCompletedCheckbox.addEventListener('input', this.onShowCompletedToggle.bind(this))
    // In general we only want to limit ourselves to our component with listener, but for some functions we
    // need the complete document
    document.addEventListener('keydown', this.onDocumentKeydown.bind(this))

    this.transientStateManager.registerSelectionChangeHandler()
    this.dialogs = new Dialogs(this.el as HTMLElement, this.dialogOverlayEl as HTMLElement)
    this.treeActionContext = new TreeActionContext(this, this.transientStateManager, this.dialogs, this.treeService)
    // TODO: tree actions should have IDs, they are registered centrally and we should be able to look
    // them up so we can just reference them here instead of instantiating them
    this.treeNodeMenu = new TreeNodeMenu([
      new TreeNodeActionMenuItem(importOpmlAction, this.treeActionContext),
      new TreeNodeActionMenuItem(exportOpmlExportAction, this.treeActionContext),
      new TreeNodeInfoMenuItem(this.treeActionContext),
    ])
    this.el.appendChild(this.treeNodeMenu)
    this.dialogs.registerDialog(new Dialog('menuTrigger', this.treeNodeMenu))
  }

  private generateTreeClasses(): string {
    return ''
  }

  getTreeElement(): Element {
    return this.el
  }

  loadNode(nodeId: string): Promise<any> {
    if (!nodeId) {
      return Promise.resolve()
    }
    if (this.treeChangeSubscription) {
      this.treeChangeSubscription.cancel()
      this.treeChangeSubscription = null
    }
    return this.reloadTree(nodeId)
      .then(() => this.treeChangeSubscription = this.treeService.subscribeToChanges(nodeId, this.onBackgroundTreeChange.bind(this)))
  }

  private getNodeVisibilityPredicate(): Predicate<RepositoryNode> {
    // consider three properties for visibility of a node:
    // - deleted: never show deleted so add NODE_IS_NOT_DELETED
    // - showCompleted: if false then add NODE_NOT_COMPLETED
    const filters = [NODE_IS_NOT_DELETED]
    if (! this.config.showCompleted) {
      filters.push(NODE_IS_NOT_COMPLETED)
    }
    return createCompositeAndPredicate(filters)
  }

  private shouldCollapsedChildrenBeLoaded(): boolean {
    return this.filterIsActive()
  }

  private reloadTree(nodeId: string): Promise<any> {
    return this.treeService.loadTree(nodeId, this.getNodeVisibilityPredicate(), this.shouldCollapsedChildrenBeLoaded())
      .then(loadedTree => this.update(loadedTree))
  }

  private onBackgroundTreeChange(): void {
    this.reloadTree(this.currentRootNodeId)
  }

  private update(tree: LoadedTree) {
    setChildren(this.breadcrumbsEl, this.generateBreadcrumbs(tree))
    if (tree.status.state === State.ERROR) {
      setChildren(this.contentEl,
        [el('div.error', `Can not load tree from backing store: ${tree.status.msg}`)])
    } else if (tree.status.state === State.LOADING) {
      setChildren(this.contentEl, [el('div.error', `Loading tree...`)])
    } else if (tree.status.state === State.LOADED) {
      this.currentRootNodeId = tree.tree.node._id
      // TODO: this is currently redoing the complete tree component for each update
      // from another peer. We need this because our RE:DOM components were getting out
      // of sync with the DOM when we do local direct DOM manipulation.
      // The nicer solution is probably to replace RE:DOM with something like
      // incremental DOM and have a complete update of the tree but really incrementally
      // and with patches
      this.content = new TreeNode(true)
      setChildren(this.contentEl, [this.content])
      const filteredTree = this.getFilteredTree(tree)
      this.content.update(filteredTree)
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

  private filterIsActive(): boolean {
    return !isEmpty(this.getFilterQuery())
  }

  private getFilteredTree(tree: LoadedTree): FilteredRepositoryNode {
    return filterNode(tree.tree, this.filterIsActive() ? new Filter(parseQuery(this.getFilterQuery())) : undefined)
  }

  private async onClick(event: Event): Promise<void> {
    const clickedElement = event.target as Element
    if (isMenuTriggerElement(clickedElement)) {
      const node = getClosestNodeElement(clickedElement)
      this.transientStateManager.setActiveNodeId(getNodeId(node))
    } else if (isToggleElement(clickedElement)) {
      event.preventDefault()
      // NOTE: we can use the getNodeForNameElement function even though this is the
      // collapseElement because they are siblings
      const node = getClosestNodeElement(clickedElement)
      const nodeClosed = isNodeClosed(node)
      const payload = nodeClosed
        ? new OpenNodeByIdCommandPayload(getNodeId(node))
        : new CloseNodeByIdCommandPayload(getNodeId(node))
      await this.performWithDom(
        new CommandBuilder(payload)
          .isUndoable()
          .isSynchronous() // we need this to be a synchronous update so we can immediately reload the node afterwards
          .build())
      if (nodeClosed) {
        // When we open the node we need to load the subtree on demand and patch it
        const nodeId = getNodeId(node)
        const loadedTree = await this.treeService.loadTree(nodeId, this.getNodeVisibilityPredicate(), this.shouldCollapsedChildrenBeLoaded())
        const filteredTree = await this.getFilteredTree(loadedTree)
        const newOpenedNode = new TreeNode(false)// can it be that we update the first node? No it's always open (right?)
        await newOpenedNode.update(filteredTree)
        node.parentElement.replaceChild(newOpenedNode.getElement(), node)
      }
    } else if (isInNoteElement(clickedElement)) {
      // for a note we need to take into account that a note may have its own markup (hence isInNoteElement)
      const noteElement = findNoteElementAncestor(clickedElement) as HTMLElement
      if (! noteElement.isContentEditable) {
        event.preventDefault()
        TreeNode.startEditingNote(noteElement as HTMLElement)
      }
    }
    // Handle clicking on links inside of names and notes
    if (isInNoteElement(clickedElement) || isInNameNode(clickedElement)) {
      if (isEmbeddedLink(clickedElement)) {
        window.open(clickedElement.getAttribute('href'), '_blank')
      } else if (isFilterTag(clickedElement)) {
        const oldValue = this.searchField.value
        this.searchField.value = isEmpty(oldValue)
          ? extractFilterText(clickedElement)
          : oldValue + ' ' + extractFilterText(clickedElement)
        this.onQueryChange() // trigger a filter operation
      }
    }
  }

  private onPaste(event: ClipboardEvent): void {
    // We don't want any formatted HTML pasted in our nodes.
    if (isInNameNode(event.target as Element) || isInNoteElement(event.target as Element)) {
      event.preventDefault()
      pasteTextUnformatted(event)
    }
  }

  private getFilterQuery(): string {
    return (this.searchField.value || '').trim()
  }

  private async onQueryChange(): Promise<void> {
    const newFilterQuery = this.getFilterQuery()
    if (newFilterQuery !== this.currentFilterQuery) {
      await this.rerenderTree()
      this.currentFilterQuery = newFilterQuery
    }
  }

  private onShowCompletedToggle() {
    this.config.showCompleted = !! this.showCompletedCheckbox.checked
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
    this.treeActionRegistry.executeKeyboardActions(KbdEventType.Input, event, this.treeActionContext)
  }

  private onKeypress(event: KeyboardEvent) {
    this.treeActionRegistry.executeKeyboardActions(KbdEventType.Keypress, event, this.treeActionContext)
  }

  private onKeydown(event: KeyboardEvent): void {
    this.treeActionRegistry.executeKeyboardActions(KbdEventType.Keydown, event, this.treeActionContext)
  }

  private onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Escape should clear the searchfield and blur the focus when we have an active query
      if (this.filterIsActive()) {
        this.searchField.value = ''
        if (document.activeElement === this.searchField) {
          this.searchField.blur()
        }
        this.onQueryChange()
      }
    } else if (this.undoTrigger.isTriggered(KbdEventType.Keydown, event)) {
      this.onUndo(event)
    } else if (this.redoTrigger.isTriggered(KbdEventType.Keydown, event)) {
      this.onRedo(event)
    }
  }

  performWithoutDom(command: Command): void {
    this.commandHandler.exec(command)
  }

  private readonly debouncedRerender = debounce(this.rerenderTree, 5000).bind(this)

  performWithDom(command: Command): Promise<void> {
    if (command) {
      const commandPromise = this.domCommandHandler.exec(command)
        .then(() => this.commandHandler.exec(command))
      // If a command requires a rerender this means we need to reload the tree
      // and then let Redom efficiently update all the nodes, however if we need
      // to focus afterwards, we need to be careful to do this after having loaded
      // the tree
      if (command.payload.requiresRender()) {
        // if it is a batch command we don't want to immediately rerender
        const renderFunction = command.batch ? this.debouncedRerender : this.rerenderTree.bind(this)
        commandPromise.then(renderFunction).then(() => {
          if (command.afterFocusNodeId) {
            this.focus(command.afterFocusNodeId, command.afterFocusPos)
          }
        })
      } else  {
        commandPromise.then(() => {
          if (command.afterFocusNodeId) {
            this.focus(command.afterFocusNodeId, command.afterFocusPos)
          }
        })
      }
      return commandPromise
    } else {
      return Promise.resolve()
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

  private onUndo(event: Event) {
    event.preventDefault()
    event.stopPropagation()
    this.performWithDom(this.commandHandler.popUndoCommand())
  }

  private onRedo(event: Event) {
    event.preventDefault()
    event.stopPropagation()
    this.performWithDom(this.commandHandler.popRedoCommand())
  }
}

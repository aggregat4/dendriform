import { html, render } from 'lit-html'
import { UndoableCommandHandler } from '../commands/command-handler-undoable'
// tslint:disable-next-line:max-line-length
import { CloseNodeByIdCommandPayload, Command, CommandBuilder, OpenNodeByIdCommandPayload, CreateChildNodeCommandPayload } from '../commands/commands'
// tslint:disable-next-line:max-line-length
import { FilteredRepositoryNode, LoadedTree, State, Subscription, ActivityIndicating, Filter, NODE_IS_NOT_DELETED, RepositoryNode, NODE_IS_NOT_COMPLETED, LifecycleAware, ResolvedRepositoryNode, Status } from '../domain/domain'
import { filterNode, parseQuery } from '../domain/domain-search'
import { TreeService } from '../service/tree-service'
// tslint:disable-next-line:max-line-length
import { debounce, isEmpty, pasteTextUnformatted, Predicate, createCompositeAndPredicate, generateUUID, setCursorPosAcrossMarkup } from '../utils/util'
import { DomCommandHandler } from './command-handler-dom'
import { KbdEventType, KeyboardEventTrigger, AllNodesSelector, toRawShortCuts, SemanticShortcut, SemanticShortcutType } from './keyboardshortcut'
// tslint:disable-next-line:max-line-length
import { findNoteElementAncestor, getNameElement, getClosestNodeElement, getNodeId, isInNoteElement, isNodeClosed, isToggleElement, isMenuTriggerElement, isEmbeddedLink, isInNameNode, isFilterTag, extractFilterText } from './tree-dom-util'
import { TreeActionContext } from './tree-actions'
import { CommandExecutor, TransientState } from './tree-helpers'
import { TreeNodeActionMenuItem, TreeNodeInfoMenuItem, TreeNodeMenu } from './tree-menu-component'
import { TreeActionRegistry } from './tree-actionregistry'
import { Dialogs, Dialog } from './dialogs'
import { importOpmlAction } from './action-opmlimport'
import { exportOpmlExportAction } from './action-opmlexport'
import { startEditingNote, renderNode } from './node-component'

customElements.define('treenode-menu', TreeNodeMenu)
customElements.define('treenode-menuitem-action', TreeNodeActionMenuItem)
customElements.define('treenode-menuitem-info', TreeNodeInfoMenuItem)

class TreeConfig {
  showCompleted: boolean = false
}

export class Tree extends HTMLElement implements CommandExecutor, LifecycleAware {
  private readonly domCommandHandler = new DomCommandHandler()

  private treeStatus: Status = { state: State.LOADING }
  private treeAncestors: RepositoryNode[] = []
  private filteredTreeRoot: FilteredRepositoryNode

  private treeChangeSubscription: Subscription

  private readonly transientStateManager = new TransientState()
  private treeActionContext: TreeActionContext = null
  private dialogs: Dialogs = null
  private config: TreeConfig = new TreeConfig()
  private currentFilterQuery: string = ''

  // We handle undo and redo internally since they are core functionality we don't want to make generic and overwritable
  private readonly undoTrigger = new KeyboardEventTrigger(KbdEventType.Keydown, new AllNodesSelector(), toRawShortCuts(new SemanticShortcut(SemanticShortcutType.Undo)))
  private readonly redoTrigger = new KeyboardEventTrigger(KbdEventType.Keydown, new AllNodesSelector(), toRawShortCuts(new SemanticShortcut(SemanticShortcutType.Redo)))

  private readonly treeTemplate = () => html`
    <div class="tree activityindicating"
      @input=${this.onInput.bind(this)}
      @keypress=${this.onKeypress.bind(this)}
      @keydown=${this.onKeydown.bind(this)}
      @click=${this.onClick.bind(this)}
      @paste=${this.onPaste.bind(this)} >
      <nav>
        <div class="breadcrumbs">
          ${this.getFullParents().map(parent => html`
          <span>
            <a href="#node=${parent._id}" data-id="${parent._id}" title="Open node '${parent.name}'">${this.renderNodeName(parent.name)}</a>
          </span>`)}
        </div>
        <button id="addNode" aria-label="Add Node" title="Add Node" @click=${this.onAddNodeButtonClick.bind(this)}>+</button>
        <div class="searchbox">
          <input class="searchField" type="search" placeholder="Filter" @input=${debounce(this.onQueryChange.bind(this), 150)}>
          <a4-spinner delayms="1000"/>
        </div>
        <fieldset class="config">
          <label>
            <input class="showCompleted" type="checkbox" ?checked=${this.config.showCompleted} @input=${this.onShowCompletedToggle.bind(this)}>
            <span>Show Completed</span>
          </label>
        </fieldset>
      </nav>
      <div class="content">
        ${this.renderTreeNodes()}
      </div>
      <div class="dialogOverlay"></div>
      <treenode-menu class="node-menu">
        <treenode-menuitem-action class="import-opml-action-menuitem" />
        <treenode-menuitem-action class="export-opml-action-menuitem" />
        <treenode-menuitem-info class="info-menuitem"/>
      </treenode-menu>
    </div>`

  private renderTreeNodes() {
    if (this.treeStatus.state === State.ERROR) {
      return html`<div class="error">Can not load tree from backing store: ${this.treeStatus.msg}</div>`
    } else if (this.treeStatus.state === State.LOADING) {
      return html`<div class="error">Loading tree...</div>`
    } else if (this.treeStatus.state === State.LOADED) {
      // this assumes that when state is loaded we also have a filtered tree root
      return renderNode(this.filteredTreeRoot, true)
    }
  }

  private getFullParents(): RepositoryNode[] {
    const ancestors = (this.treeAncestors || []).reverse()
    return this.filteredTreeRoot ? ancestors.concat(this.filteredTreeRoot.node) : ancestors
  }

  private renderNodeName(name: string): string {
    if (name === 'ROOT') {
      return 'Root'
    } else {
      return name
    }
  }

  constructor(readonly commandHandler: UndoableCommandHandler, readonly treeService: TreeService, readonly treeActionRegistry: TreeActionRegistry, readonly activityIndicating: ActivityIndicating) {
    super()
    render(this.treeTemplate(), this)
    // In general we only want to limit ourselves to our component with listener, but for some functions we
    // need the complete document
    document.addEventListener('keydown', this.onDocumentKeydown.bind(this))

    const dialogOverlayEl = this.querySelector('.dialogOverlay')
    this.transientStateManager.registerSelectionChangeHandler()
    this.dialogs = new Dialogs(this, dialogOverlayEl as HTMLElement)
    this.treeActionContext = new TreeActionContext(this, this.transientStateManager, this.dialogs, this.treeService)

    const importOpmlActionMenuItem = this.querySelector('.import-opml-action-menuitem') as unknown as TreeNodeActionMenuItem
    importOpmlActionMenuItem.treeAction = importOpmlAction
    importOpmlActionMenuItem.treeActionContext = this.treeActionContext

    const exportOpmlActionMenuItem = this.querySelector('.export-opml-action-menuitem') as unknown as TreeNodeActionMenuItem
    exportOpmlActionMenuItem.treeAction = exportOpmlExportAction
    exportOpmlActionMenuItem.treeActionContext = this.treeActionContext

    const infoMenuItem = this.querySelector('.info-menuitem') as unknown as TreeNodeActionMenuItem
    infoMenuItem.treeActionContext = this.treeActionContext

    const treeNodeMenu = this.querySelector('.node-menu') as unknown as TreeNodeMenu
    this.dialogs.registerDialog(new Dialog('menuTrigger', treeNodeMenu))
  }

  async init(): Promise<void> {
    await this.treeService.init()
    this.treeActionRegistry.mountDialogs(this)
  }

  async deinit(): Promise<void> {
    this.treeActionRegistry.unmountDialogs(this)
    await this.treeService.deinit()
  }

  async loadNode(nodeId: string): Promise<any> {
    if (!nodeId) {
      return Promise.resolve()
    }
    if (this.treeChangeSubscription) {
      this.treeChangeSubscription.cancel()
      this.treeChangeSubscription = null
    }
    const loadedTree = await this.treeService.loadTree(nodeId, this.getNodeVisibilityPredicate(), this.shouldCollapsedChildrenBeLoaded())
    await this.update(loadedTree)
    this.treeChangeSubscription = this.treeService.subscribeToChanges(nodeId, this.onBackgroundTreeChange.bind(this))
  }

  private getNodeVisibilityPredicate(): Predicate<RepositoryNode> {
    // consider three properties for visibility of a node:
    // - deleted: never show deleted so add NODE_IS_NOT_DELETED
    // - showCompleted: if false then add NODE_NOT_COMPLETED
    const filters = [NODE_IS_NOT_DELETED]
    if (!this.config.showCompleted) {
      filters.push(NODE_IS_NOT_COMPLETED)
    }
    return createCompositeAndPredicate(filters)
  }

  private shouldCollapsedChildrenBeLoaded(): boolean {
    return this.filterIsActive()
  }

  private rerenderTree(): Promise<any> {
    return this.loadNode(this.filteredTreeRoot.node._id)
  }

  private onBackgroundTreeChange(): void {
    this.rerenderTree()
  }

  update(tree: LoadedTree) {
    this.treeStatus = tree.status
    this.treeAncestors = tree.ancestors
    this.filteredTreeRoot = this.getFilteredTree(tree.tree)
    render(this.treeTemplate(), this)
  }

  private filterIsActive(): boolean {
    return !isEmpty(this.getFilterQuery())
  }

  private getFilteredTree(node: ResolvedRepositoryNode): FilteredRepositoryNode {
    return filterNode(node, this.filterIsActive() ? new Filter(parseQuery(this.getFilterQuery())) : undefined)
  }

  private getSearchFieldElement(): HTMLInputElement {
    return this.querySelector('.searchField')
  }

  private getCompletedCheckboxElement(): HTMLInputElement {
    return this.querySelector('.showCompleted')
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
        // this should be efficient: we _are_ loading the entire tree but that node should be opned now and update
        // NOTE: we used to only load the subtree here, that was definitely more efficient. Theoretically we could
        // still do this and patch the loadedtree model
        this.rerenderTree()
      }
    } else if (isInNoteElement(clickedElement)) {
      // for a note we need to take into account that a note may have its own markup (hence isInNoteElement)
      const noteElement = findNoteElementAncestor(clickedElement) as HTMLElement
      if (!noteElement.isContentEditable) {
        event.preventDefault()
        startEditingNote(noteElement as HTMLElement)
      }
    }
    // Handle clicking on links inside of names and notes
    if (isInNoteElement(clickedElement) || isInNameNode(clickedElement)) {
      if (isEmbeddedLink(clickedElement)) {
        window.open(clickedElement.getAttribute('href'), '_blank')
      } else if (isFilterTag(clickedElement)) {
        const searchField = this.getSearchFieldElement()
        const oldValue = searchField.value
        searchField.value = isEmpty(oldValue)
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
    return (this.getSearchFieldElement().value || '').trim()
  }

  private async onQueryChange(): Promise<void> {
    const newFilterQuery = this.getFilterQuery()
    if (newFilterQuery !== this.currentFilterQuery) {
      await this.rerenderTree()
      this.currentFilterQuery = newFilterQuery
    }
  }

  private onShowCompletedToggle() {
    this.config.showCompleted = !!this.getCompletedCheckboxElement().checked
    this.rerenderTree()
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

  private async onAddNodeButtonClick(event: Event): Promise<void> {
    const newNodeId = generateUUID()
    const command = new CommandBuilder(
      new CreateChildNodeCommandPayload(newNodeId, '', null, this.filteredTreeRoot.node._id))
      .isUndoable()
      .isBatch()
      .build()
    await this.performWithDom(command)
  }

  private onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Escape should clear the searchfield and blur the focus when we have an active query
      if (this.filterIsActive()) {
        const searchField = this.getSearchFieldElement()
        searchField.value = ''
        if (document.activeElement === searchField) {
          searchField.blur()
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
            this.focusNode(command.afterFocusNodeId, command.afterFocusPos)
          }
        })
      } else {
        commandPromise.then(() => {
          if (command.afterFocusNodeId) {
            this.focusNode(command.afterFocusNodeId, command.afterFocusPos)
          }
        })
      }
      return commandPromise
    } else {
      return Promise.resolve()
    }
  }

  private focusNode(nodeId: string, charPos: number) {
    const element = document.getElementById(nodeId)
    // tslint:disable-next-line:no-console
    // console.log(`focusing on node ${nodeId} at ${charPos}, exists?`, element)
    if (element) {
      const nameElement: HTMLElement = getNameElement(element) as HTMLElement
      nameElement.focus()
      if (charPos > -1) {
        setCursorPosAcrossMarkup(nameElement, charPos)
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

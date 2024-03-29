import { html, render } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { UndoableCommandHandler } from '../commands/command-handler-undoable'
import {
  CloseNodeByIdCommandPayload,
  Command,
  CommandBuilder,
  CreateChildNodeCommandPayload,
  OpenNodeByIdCommandPayload,
} from '../commands/commands'
import { Subscription } from '../domain/domain'
import { JoinProtocol } from '../replicaset/join-protocol'
import {
  LoadedTree,
  NODE_IS_NOT_COMPLETED,
  NODE_IS_NOT_DELETED,
  RepositoryNode,
  ResolvedRepositoryNode,
  State,
  Status,
} from '../repository/repository'
import { Filter, FilteredRepositoryNode, filterNode, parseQuery } from '../repository/search'
import { TreeService } from '../service/tree-service'
import {
  createCompositeAndPredicate,
  debounce,
  generateUUID,
  isEmpty,
  pasteTextUnformatted,
  Predicate,
  setCursorPosAcrossMarkup,
} from '../utils/util'
import { OpmlExportAction } from './action-opmlexport'
import './action-opmlimport' // direct import to trigger side effects (custom element registration)
import { OpmlImportAction } from './action-opmlimport'
import './activity-indicator-component' // for side effects
import { DomCommandHandler } from './command-handler-dom'
import { OpmlImportDialog } from './dialog-opmlimport'
import { Dialog, DialogElement, Dialogs } from './dialogs'
import {
  AllNodesSelector,
  KbdEventType,
  KeyboardEventTrigger,
  SemanticShortcut,
  SemanticShortcutType,
  toRawShortCuts,
} from './keyboardshortcut'
import { renderNode, startEditingNote } from './node-component'
import { TreeActionRegistry } from './tree-actionregistry'
import { TreeActionContext } from './tree-actions'
import {
  extractFilterText,
  findNoteElementAncestor,
  getClosestNodeElement,
  getNameElement,
  getNodeId,
  getParentNodeId,
  isEmbeddedLink,
  isFilterTag,
  isInNameNode,
  isInNoteElement,
  isMenuTriggerElement,
  isNodeClosed,
  isToggleElement,
} from './tree-dom-util'
import { CommandExecutor, TransientState } from './tree-helpers'
import './tree-menu-component' // direct import because of side effects in that module (custom element registration), see also https://github.com/Microsoft/TypeScript/wiki/FAQ#why-are-imports-being-elided-in-my-emit
import { TreeNodeActionMenuItem } from './tree-menu-component'

class TreeConfig {
  showCompleted = false
}

export class Tree extends HTMLElement implements CommandExecutor {
  private readonly domCommandHandler = new DomCommandHandler()

  private treeStatus: Status = { state: State.LOADING }
  private treeAncestors: RepositoryNode[] = []
  private filteredTreeRoot: FilteredRepositoryNode

  private treeChangeSubscription: Subscription

  private readonly transientStateManager = new TransientState()
  private treeActionContext: TreeActionContext = null
  private dialogs: Dialogs = null
  private config: TreeConfig = new TreeConfig()
  private currentFilterQuery = ''

  constructor(
    readonly commandHandler: UndoableCommandHandler,
    readonly treeActionRegistry: TreeActionRegistry,
    readonly treeService: TreeService,
    readonly joinProtocol: JoinProtocol
  ) {
    super()
    // it may be that we had not joined the replicaset yet so whenever we get
    // the event that something changed in our join status, rerender the tree
    joinProtocol.JoinEvent.on(() => this.rerenderTree())
  }

  // We handle undo and redo internally since they are core functionality we don't want to make generic and overwritable
  private readonly undoTrigger = new KeyboardEventTrigger(
    KbdEventType.Keydown,
    new AllNodesSelector(),
    toRawShortCuts(new SemanticShortcut(SemanticShortcutType.Undo))
  )
  private readonly redoTrigger = new KeyboardEventTrigger(
    KbdEventType.Keydown,
    new AllNodesSelector(),
    toRawShortCuts(new SemanticShortcut(SemanticShortcutType.Redo))
  )

  private readonly treeTemplate = () => html`<div
    class="tree activityindicating"
    @input=${this.onInput.bind(this)}
    @keypress=${this.onKeypress.bind(this)}
    @keydown=${this.onKeydown.bind(this)}
    @click=${this.onClick.bind(this)}
    @paste=${this.onPaste.bind(this)}
  >
    <nav>
      <div class="breadcrumbs">
        ${this.getFullParents().map(
          (parent) => html` <span>
            <a href="#node=${parent.id}" data-id="${parent.id}" title="Open node '${parent.name}'"
              >${this.renderNodeName(parent.name)}</a
            >
          </span>`
        )}
      </div>
      <button
        id="addNode"
        aria-label="Add Node"
        title="Add Node"
        ?disabled=${!this.joinProtocol.hasJoinedReplicaSet()}
        @click=${this.onAddNodeButtonClick.bind(this)}
        >+</button
      >
      <div class="searchbox">
        <input
          class="searchField"
          type="search"
          ?disabled=${!this.joinProtocol.hasJoinedReplicaSet()}
          @input=${debounce(this.onQueryChange.bind(this), 150)}
        />
        <df-spinner delayms="1000"></df-spinner>
      </div>
      <fieldset class="config">
        <label>
          <input
            class="showCompleted"
            type="checkbox"
            ?checked=${this.config.showCompleted}
            @input=${this.onShowCompletedToggle.bind(this)}
          />
          <span>Show Completed</span>
        </label>
      </fieldset>
    </nav>
    <div class="content">${this.renderTreeNodes()}</div>
    <df-dialog class="node-menu">
      <df-menuitem-action class="import-opml-action-menuitem"></df-menuitem-action>
      <df-menuitem-action class="export-opml-action-menuitem"></df-menuitem-action>
      <df-menuitem-info class="info-menuitem"></df-menuitem-info>
    </df-dialog>
    <df-dialog class="opml-import-dialog">
      <df-omplimportdialog></df-omplimportdialog>
    </df-dialog>
  </div>`

  private renderTreeNodes() {
    if (!this.joinProtocol.hasJoinedReplicaSet()) {
      return html`<div class="error"
        >Was not able to join the replicaset for this document yet</div
      >`
    } else if (this.treeStatus.state === State.ERROR) {
      return html`<div class="error">
        Can not load tree from backing store: ${this.treeStatus.msg}
      </div>`
    } else if (this.treeStatus.state === State.LOADING) {
      return html`<div class="error">Loading tree...</div>`
    } else if (this.treeStatus.state === State.LOADED) {
      // this assumes that when state is loaded we also have a filtered tree root
      // return renderNode(this.filteredTreeRoot, true)
      const rootels = [this.filteredTreeRoot]
      return html`${repeat(
        rootels,
        (child: FilteredRepositoryNode) => child.node.id,
        (child: FilteredRepositoryNode) => renderNode(child, true)
      )}`
    }
  }

  private getFullParents(): RepositoryNode[] {
    const ancestors = (this.treeAncestors || []).reverse()
    return this.filteredTreeRoot ? ancestors.concat(this.filteredTreeRoot.node) : ancestors
  }

  private renderNodeName(name: string): string {
    return name === 'ROOT' ? 'Root' : name
  }

  mount() {
    render(this.treeTemplate(), this)
    // In general we only want to limit ourselves to our own component with listeners, but for some functions we
    // need the complete document
    document.addEventListener('keydown', this.onDocumentKeydown.bind(this))

    this.transientStateManager.registerSelectionChangeHandler()

    this.dialogs = new Dialogs(this)
    const treeNodeMenu = this.querySelector('.node-menu') as unknown as DialogElement
    this.dialogs.registerDialog(new Dialog('menuTrigger', treeNodeMenu))
    this.treeActionContext = new TreeActionContext(
      this,
      this.transientStateManager,
      this.dialogs,
      this.treeService
    )

    const opmlImportElement = this.querySelector(
      'df-omplimportdialog'
    ) as unknown as OpmlImportDialog
    opmlImportElement.treeActionContext = this.treeActionContext

    const opmlImportDialog = this.querySelector('.opml-import-dialog') as unknown as DialogElement
    const importOpmlActionMenuItem = this.querySelector(
      '.import-opml-action-menuitem'
    ) as unknown as TreeNodeActionMenuItem
    importOpmlActionMenuItem.treeAction = new OpmlImportAction(opmlImportDialog)
    importOpmlActionMenuItem.treeActionContext = this.treeActionContext

    const exportOpmlActionMenuItem = this.querySelector(
      '.export-opml-action-menuitem'
    ) as unknown as TreeNodeActionMenuItem
    exportOpmlActionMenuItem.treeAction = new OpmlExportAction()
    exportOpmlActionMenuItem.treeActionContext = this.treeActionContext

    const infoMenuItem = this.querySelector('.info-menuitem') as unknown as TreeNodeActionMenuItem
    infoMenuItem.treeActionContext = this.treeActionContext
  }

  async loadNode(nodeId: string): Promise<void> {
    if (!nodeId) {
      return Promise.resolve()
    }
    if (this.treeChangeSubscription) {
      this.treeChangeSubscription.cancel()
      this.treeChangeSubscription = null
    }
    const loadedTree = await this.treeService.loadTree(
      nodeId,
      this.getNodeVisibilityPredicate(),
      this.shouldCollapsedChildrenBeLoaded()
    )
    this.update(loadedTree)
    this.treeChangeSubscription = this.treeService.subscribeToChanges(
      nodeId,
      this.onBackgroundTreeChange.bind(this)
    )
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

  private async rerenderTree(): Promise<void> {
    await this.loadNode(this.filteredTreeRoot.node.id)
  }

  private async onBackgroundTreeChange(): Promise<void> {
    await this.rerenderTree()
  }

  update(tree: LoadedTree): void {
    this.treeStatus = tree.status
    this.treeAncestors = tree.ancestors
    this.filteredTreeRoot = this.getFilteredTree(tree.tree)
    render(this.treeTemplate(), this)
  }

  private filterIsActive(): boolean {
    return !isEmpty(this.getFilterQuery())
  }

  private getFilteredTree(node: ResolvedRepositoryNode): FilteredRepositoryNode {
    return filterNode(
      node,
      this.filterIsActive() ? new Filter(parseQuery(this.getFilterQuery())) : undefined
    )
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
      const parentNodeId = getParentNodeId(node)
      const nodeClosed = isNodeClosed(node)
      const payload = nodeClosed
        ? new OpenNodeByIdCommandPayload(getNodeId(node), parentNodeId)
        : new CloseNodeByIdCommandPayload(getNodeId(node), parentNodeId)
      await this.perform(
        new CommandBuilder(payload)
          .isUndoable()
          // synchronous updates trigger a re-render
          .isSynchronous()
          .build()
      )
    } else if (isInNoteElement(clickedElement)) {
      // for a note we need to take into account that a note may have its own markup (hence isInNoteElement)
      const noteElement = findNoteElementAncestor(clickedElement) as HTMLElement
      if (!noteElement.isContentEditable) {
        event.preventDefault()
        startEditingNote(noteElement)
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
        await this.onQueryChange() // trigger a filter operation
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

  private async onShowCompletedToggle() {
    this.config.showCompleted = !!this.getCompletedCheckboxElement().checked
    await this.rerenderTree()
  }

  private async onInput(event: InputEvent) {
    // apparently we can get some fancy newfangled input events we may want to ignore
    // see https://www.w3.org/TR/input-events-1/
    if (
      event.inputType === 'historyUndo' ||
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      event.inputType === 'historyRedo'
    ) {
      return
    }
    await this.treeActionRegistry.executeKeyboardActions(
      KbdEventType.Input,
      event,
      this.treeActionContext
    )
  }

  private async onKeypress(event: KeyboardEvent) {
    await this.treeActionRegistry.executeKeyboardActions(
      KbdEventType.Keypress,
      event,
      this.treeActionContext
    )
  }

  private async onKeydown(event: KeyboardEvent) {
    await this.treeActionRegistry.executeKeyboardActions(
      KbdEventType.Keydown,
      event,
      this.treeActionContext
    )
  }

  private async onAddNodeButtonClick(): Promise<void> {
    const newNodeId = generateUUID()
    const command = new CommandBuilder(
      new CreateChildNodeCommandPayload(newNodeId, '', null, this.filteredTreeRoot.node.id)
    )
      .isUndoable()
      .build()
    await this.perform(command)
  }

  private async onDocumentKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      // Escape should clear the searchfield and blur the focus when we have an active query
      if (this.filterIsActive()) {
        const searchField = this.getSearchFieldElement()
        searchField.value = ''
        if (document.activeElement === searchField) {
          searchField.blur()
        }
        await this.onQueryChange()
      }
    } else if (this.undoTrigger.isTriggered(KbdEventType.Keydown, event)) {
      await this.onUndo(event)
    } else if (this.redoTrigger.isTriggered(KbdEventType.Keydown, event)) {
      await this.onRedo(event)
    }
  }

  private readonly debouncedRerender: () => void = debounce(
    this.rerenderTree.bind(this),
    5000
  ).bind(this)

  async perform(command: Command) {
    if (command) {
      await this.domCommandHandler.exec(command)
      if (!command.payload.requiresRender() && command.afterFocusNodeId) {
        // if the command does not require a rerender of the tree and we need
        // to refocus the cursor after the action, we need to do it BEFORE we
        // trigger any backend operations. Otherwise we will possible interleave
        // this dom operation that can happen very late (depending on how much
        // needs to happen in the backend) with newer dom operations that have
        // arrived in the meantime
        this.focusNode(command.afterFocusNodeId, command.afterFocusPos)
      }
      if (command.payload.requiresRender()) {
        // in case we require a rerender we want to wait until the backend is done before yielding back to the client since they may significantly alter the tree
        await this.commandHandler.exec(command)
        // if it is a batch command we don't want to immediately rerender
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const renderFunction = command.batch ? this.debouncedRerender : this.rerenderTree.bind(this)
        await renderFunction()
        if (command.afterFocusNodeId) {
          // FIXME: we still have potential bugs here: similar to the no-rerender case, if we do a DOM operation
          // like refocusing the cursor AFTER a bunch of backend operations AND after a full rerender
          // then we may well interfere with newer dom operations that happen afterwards
          // In practice the problem may be limited since people can't type instantly, but it is still a concern.
          this.focusNode(command.afterFocusNodeId, command.afterFocusPos)
        }
      } else {
        // if the command does not require a rerender we can just execute async
        void this.commandHandler.exec(command)
      }
    }
  }

  private focusNode(nodeId: string, charPos: number) {
    const element = document.getElementById(nodeId)
    if (element) {
      const nameElement: HTMLElement = getNameElement(element) as HTMLElement
      nameElement.focus()
      if (charPos > -1) {
        setCursorPosAcrossMarkup(nameElement, charPos)
      }
    }
  }

  private async onUndo(event: Event): Promise<void> {
    event.preventDefault()
    event.stopPropagation()
    await this.perform(this.commandHandler.popUndoCommand())
  }

  private async onRedo(event: Event): Promise<void> {
    event.preventDefault()
    event.stopPropagation()
    await this.perform(this.commandHandler.popRedoCommand())
  }
}

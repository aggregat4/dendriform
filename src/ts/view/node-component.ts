import { el, setAttr, setChildren, list, setStyle, RedomComponent } from 'redom'
import { RepositoryNode, FilteredRepositoryNode, DeferredArray } from '../domain/domain'
import { isCursorAtContentEditableBeginning } from '../util'

export class TreeNode implements RedomComponent {
  private first: boolean
  private ncEl
  private childList
  // For REDOM
  el: HTMLElement

  // 1. check for own filterhits
  // 2. process all children
  // 3. if filter then generate a list of all includedInFilter children
  // 3. if self included inFilter or ANY children included in filter: then includedInFilter = true
  // 4. if (filter and includedInFilter): render node and those children that are included
  // 5. if not filter: render node and all children
  constructor(first: boolean = false) {
    this.first = first
    this.el = el('div',
      this.ncEl = el('div.nc'),
      this.childList = list('div.children', TreeNode, n => n.node._id)) // key can be a lookup function (thanks finnish dude!)
  }

  update(treeNode: FilteredRepositoryNode) {
    setAttr(this.el, {
      id: treeNode.node._id,
      class: this.genClass(treeNode.node, this.first),
    })
    const childElements = this.getChildElements(treeNode)
    setChildren(this.ncEl, [
      el('a', { href: `#node=${treeNode.node._id}`, title: 'Focus on this node' }, ''),
      el('div.name', { contentEditable: true }, treeNode.filteredName ? treeNode.filteredName.fragment : ''),
      // we only hide the toggle button when the childElements array exists and is empty, otherwise it may be that we just haven't loaded the nodes yet since we do that on demand
      el(`span.toggle${childElements.loaded && childElements.elements.length === 0 ? '.hidden' : ''}`, { title: 'Open or close node'}),
      el('div.note', treeNode.filteredNote ? treeNode.filteredNote.fragment : null),
      el('span.menuTrigger', {title: 'Show menu', 'aria-haspopup': 'true'}, '☰'), // trigram for heaven (U+2630)
    ])
    this.childList.update(childElements.elements)
  }

  private getChildElements(treeNode: FilteredRepositoryNode): DeferredArray<FilteredRepositoryNode> {
    return {
      loaded: treeNode.children.loaded,
      elements: treeNode.children.elements.filter(c => c.isIncluded()),
    }
  }

  getElement(): Element {
    return this.el
  }

  private isRoot(node: RepositoryNode): boolean {
    return node._id === 'ROOT'
  }

  /**
   * Has special casing for nodes that are the first on the page, they are always open.
   */
  private genClass(node: RepositoryNode, isFirst: boolean): string {
    return 'node' + (this.isRoot(node) ? ' root' : '') + (isFirst ? ' first' : '') +
      (node.collapsed && !isFirst ? ' closed' : ' open')
  }

  // install event handler to listen for escape (or backspace in the beginning when empty,
  //   or arrow up in beginning, etc)
  // TODO: I would like to have this code on the node-component but then I would need to put the
  // event handlers there and I prefer having them globally... what to do?
  static startEditingNote(noteEl: HTMLElement): void {
    // hard assumption that we have two siblings and the last one is the note element
    setAttr(noteEl, { contentEditable: true, class: 'note editing' })
    setStyle(noteEl, { display: 'block' })
    noteEl.addEventListener('keydown', TreeNode.onNoteKeydown)
    noteEl.addEventListener('blur', TreeNode.onNoteBlur)
    noteEl.focus()
  }

  static stopEditingNote(noteEl: HTMLElement, refocus: boolean): void {
    noteEl.removeEventListener('keydown', TreeNode.onNoteKeydown)
    noteEl.removeEventListener('blur', TreeNode.onNoteBlur)
    setAttr(noteEl, { contentEditable: false, class: 'note' })
    noteEl.style.display = null
    if (refocus) {
      const nameEl = noteEl.previousElementSibling.previousElementSibling as HTMLElement
      nameEl.focus()
    }
  }

  private static onNoteKeydown(event: KeyboardEvent): void {
    if ((event.key === 'Escape') ||
        (event.key === 'ArrowUp' && isCursorAtContentEditableBeginning('note'))) {
      event.preventDefault()
      TreeNode.stopEditingNote(event.target as HTMLElement, true)
    }
  }

  private static onNoteBlur(event: FocusEvent): void {
    event.preventDefault()
    TreeNode.stopEditingNote(event.target as HTMLElement, false)
  }

}

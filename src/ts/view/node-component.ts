import { el, setAttr, setChildren, list, setStyle } from 'redom'
import { RepositoryNode, ResolvedRepositoryNode, FilteredRepositoryNode } from '../domain/domain'
import { isCursorAtContentEditableBeginning } from '../util'

export class TreeNode {
  private first: boolean
  private el
  private ncEl
  // private childrenEl
  private childList

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
      // this.childrenEl = el('div.children'))
      this.childList = list('div.children', TreeNode, n => n.node._id)) // key can be a lookup function (thanks finnish dude!)
  }

  update(treeNode: FilteredRepositoryNode) {
    setAttr(this.el, {
      id: treeNode.node._id,
      class: this.genClass(treeNode, this.first),
    })
    setChildren(this.ncEl,
      el('a', { href: `#node=${treeNode.node._id}`, title: 'Open this node' }, '•'), // &#8226;
      el('div.name', { contentEditable: true }, treeNode.filteredName ? treeNode.filteredName.fragment : ''),
      el('span.toggle'),
      el('div.note', treeNode.filteredNote ? treeNode.filteredNote.fragment : null),
      el('span.menuTrigger', {title: 'Show menu', 'aria-haspopup': 'true'}, '☰')) // trigram for heaven (U+2630)
    this.childList.update(treeNode.children.filter(c => c.isIncluded()))
  }

  getElement(): Element {
    return this.el
  }

  private isRoot(node: RepositoryNode): boolean {
    return node._id === 'ROOT'
  }

  private genClass(node: ResolvedRepositoryNode, isFirst: boolean): string {
    return 'node' + (this.isRoot(node.node) ? ' root' : '') + (isFirst ? ' first' : '') +
      (node.node.collapsed ? ' closed' : ' open')
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

/* eslint-disable @typescript-eslint/no-unsafe-return */
import { html, TemplateResult } from 'lit-html'
import { live } from 'lit-html/directives/live.js'
import { repeat } from 'lit-html/directives/repeat.js'
import { DeferredArray, RepositoryNode } from '../repository/repository'
import { FilteredRepositoryNode } from '../repository/search'
import { isCursorAtContentEditableBeginning } from '../utils/util'

/** ☰ = trigram for heaven (U+2630) */
const nodeTemplate = (
  node: FilteredRepositoryNode,
  children: DeferredArray<FilteredRepositoryNode>,
  first: boolean
) =>
  // prettier-ignore
  html`
<div
  id="${node.node.id}"
  class="${genClass(node.node, first, node.filterApplied && node.isIncluded())}">
  <div class="nc">
    <a href="#node=${node.node.id}" title="Focus on this node"></a>
    <div class="name" .innerHTML="${live(node.filteredName?.fragment ?? '')}" contenteditable="true"></div>
    <span
      class="toggle ${node.children.loaded && !node.node.collapsed && children.elements.length === 0
        ? 'hidden'
        : ''}"
      title="Open or close node"></span>
    <div class="note" .innerHTML="${live(node.filteredNote?.fragment ?? '')}" contenteditable="false"></div>
    <span class="menuTrigger" title="Show menu" aria-haspopup="true">☰</span>
  </div>
  <div class="children">
    ${repeat(children.elements, (child: FilteredRepositoryNode) => child.node.id, (child: FilteredRepositoryNode) => renderNode(child, false))}
  </div>
</div>`

export function renderNode(node: FilteredRepositoryNode, first: boolean): TemplateResult {
  return nodeTemplate(node, getChildElements(node), first)
}

function getChildElements(treeNode: FilteredRepositoryNode): DeferredArray<FilteredRepositoryNode> {
  return {
    loaded: treeNode.children.loaded,
    elements: treeNode.children.elements.filter((c) => c.isIncluded()),
  }
}

function isRoot(node: RepositoryNode): boolean {
  return node.id === 'ROOT'
}

/** Has special casing for nodes that are the first on the page, they are always open. */
function genClass(node: RepositoryNode, isFirst: boolean, isFilterIncluded: boolean): string {
  return (
    'node' +
    (isRoot(node) ? ' root' : '') +
    (isFirst ? ' first' : '') +
    // make sure nodes are always open when they are first or filtered
    (node.collapsed && !isFirst && !isFilterIncluded ? ' closed' : ' open') +
    (node.completed ? ' completed' : '')
  )
}

// install event handler to listen for escape (or backspace in the beginning when empty,
//   or arrow up in beginning, etc)
export function startEditingNote(noteEl: HTMLElement) {
  // hard assumption that we have two siblings and the last one is the note element
  noteEl.setAttribute('contenteditable', 'true')
  noteEl.classList.add('editing')
  noteEl.style.display = 'block'
  noteEl.addEventListener('keydown', onNoteKeydown)
  noteEl.addEventListener('blur', onNoteBlur)
  noteEl.focus()
}

function stopEditingNote(noteEl: HTMLElement, refocus: boolean): void {
  noteEl.removeEventListener('keydown', onNoteKeydown)
  noteEl.removeEventListener('blur', onNoteBlur)
  noteEl.setAttribute('contenteditable', 'false')
  noteEl.classList.remove('editing')
  noteEl.style.display = null
  if (refocus) {
    const nameEl = noteEl.previousElementSibling.previousElementSibling as HTMLElement
    nameEl.focus()
  }
}

function onNoteKeydown(event: KeyboardEvent): void {
  if (
    event.key === 'Escape' ||
    (event.key === 'ArrowUp' && isCursorAtContentEditableBeginning('note'))
  ) {
    event.preventDefault()
    stopEditingNote(event.target as HTMLElement, true)
  }
}

function onNoteBlur(event: FocusEvent): void {
  event.preventDefault()
  stopEditingNote(event.target as HTMLElement, false)
}

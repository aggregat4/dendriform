import { el, text, setAttr, setChildren, list } from 'redom'
import {
  RepositoryNode,
  ResolvedRepositoryNode,
  FilteredRepositoryNode,
} from '../domain/domain'

export class TreeNode {
  private first: boolean
  private el
  private ncEl
  private childrenEl
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
      this.childrenEl = el('div.children'))
    // key can be a lookup function (thanks finnish dude!)
    this.childList = list(this.childrenEl, TreeNode, n => n.node._id)
  }

  update(treeNode: FilteredRepositoryNode) {
    setAttr(this.el, {
      id: treeNode.node._id,
      class: this.genClass(treeNode, this.first),
    })
    setChildren(this.ncEl,
      el('a', { href: `#node=${treeNode.node._id}` }, '•'), // &#8226;
      el('div.name', { contentEditable: true }, treeNode.filteredName ? treeNode.filteredName.fragment : ''),
      el('span.toggle'),
      el('div.note', treeNode.filteredNote ? treeNode.filteredNote.fragment : null))
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

}

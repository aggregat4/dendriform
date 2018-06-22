import { el, text, setAttr, setChildren, list } from 'redom'
import {
  RepositoryNode,
  ResolvedRepositoryNode,
  FilteredRepositoryNode,
  Highlight,
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

/*  private highlight(content: string, hits: Highlight[]): Element[] {
    const segments = []
    let pos = 0
    // tslint:disable-next-line:prefer-for-of
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i]
      if (pos !== hit.pos) {
        segments.push(text(content.slice(pos, hit.pos)))
      }
      pos = hit.pos + hit.length
      segments.push(el('mark', content.slice(hit.pos, pos)))
    }
    if (pos < content.length) {
      segments.push(text(content.slice(pos, content.length)))
    }
    return segments
  }
*/

  private isRoot(node: RepositoryNode): boolean {
    return node._id === 'ROOT'
  }

  private genClass(node: ResolvedRepositoryNode, isFirst: boolean): string {
    return 'node' + (this.isRoot(node.node) ? ' root' : '') + (isFirst ? ' first' : '') +
      (node.node.collapsed ? ' closed' : ' open')
  }

}

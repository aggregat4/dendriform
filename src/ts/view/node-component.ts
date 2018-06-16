import { el, text, setAttr, setChildren, list } from 'redom'
import {
  RelativeLinearPosition,
  RepositoryNode,
  ResolvedRepositoryNode,
  createNewResolvedRepositoryNode,
  FilteredRepositoryNode,
  Filter,
  Highlight,
} from '../domain/domain'
import {
  Command,
} from '../service/service'
import {
  getNodeId,
  getParentNode,
  hasChildren,
  getNameElement,
  getChildrenElement,
  getChildrenElementOrCreate,
  getNodeForNameElement,
  isNode,
} from './tree-dom-util'

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
    let noteEl: HTMLElement = null
    setAttr(this.el, {
      id: treeNode.node._id,
      class: this.genClass(treeNode, this.first),
    })
    setChildren(this.ncEl,
      el('a', { href: `#node=${treeNode.node._id}` }, '•'), // &#8226;
      el('div.name', { contentEditable: true },
        // Only attempt to mark up search hits when we are included in the filter
        // and we actually have any hits ourselves (could be only our children have hits)
        treeNode.filterApplied ? this.highlight(treeNode.node.name, treeNode.nameHits) : [text(treeNode.node.name)]),
      el('span.toggle'),
      noteEl = el('div.note'))
    noteEl.innerHTML = treeNode.node.content
    this.childList.update(treeNode.children.filter(c => c.isIncluded()))
  }

  getElement(): Element {
    return this.el
  }

  private highlight(content: string, hits: Highlight[]): Element[] {
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

  private isRoot(node: RepositoryNode): boolean {
    return node._id === 'ROOT'
  }

  private genClass(node: ResolvedRepositoryNode, isFirst: boolean): string {
    return 'node' + (this.isRoot(node.node) ? ' root' : '') + (isFirst ? ' first' : '') +
      (node.node.collapsed ? ' closed' : ' open')
  }

}

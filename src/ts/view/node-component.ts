import { el, text, setAttr } from 'redom'
import {
  RelativeLinearPosition,
  RepositoryNode,
  ResolvedRepositoryNode,
  createNewResolvedRepositoryNode,
} from '../domain/domain'
import {
  Command,
  Filter,
  Highlight,
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
  private filter?: Filter
  private el
  private nameHits: Highlight[]
  // TODO: future extension: allow descriptions to be searched
  // private descHits: FilterHits
  private includedInFilter: boolean = false

  // 1. check for own filterhits
  // 2. process all children
  // 3. if filter then generate a list of all includedInFilter children
  // 3. if self included inFilter or ANY children included in filter: then includedInFilter = true
  // 4. if (filter and includedInFilter): render node and those children that are included
  // 5. if not filter: render node and all children
  constructor(treeNode: ResolvedRepositoryNode, first: boolean, filter?: Filter) {
    this.first = first
    this.filter = filter
    const children = this.generateChildren(treeNode)
    if (!filter || this.includedInFilter) {
      this.generateDom(treeNode, first, children)
    }
  }

  private generateChildren(treeNode: ResolvedRepositoryNode): TreeNode[] {
    // Process all the children
    let children = treeNode.children && treeNode.children.length > 0 ?
      treeNode.children.map(c => new TreeNode(c, false, this.filter)) : []
    if (this.filter) {
      // only include children that also are in the filter
      children = children.filter(c => c.isIncludedInFilter())
      // Check for own filterHits
      this.nameHits = []
      let pos = 0 - this.filter.query.length
      const lowerCaseName = treeNode.node.name.toLowerCase()
      while ((pos = lowerCaseName.indexOf(this.filter.query, pos + this.filter.query.length)) > -1) {
        this.nameHits.push({pos, length: this.filter.query.length})
      }
      // When there are filtered children or we have a hit, then we should be included
      if (children.length > 0 || this.nameHits.length > 0) {
        this.includedInFilter = true
      }
    }
    return children
  }

  // TODO: smaller class names to save bytes?
  private generateDom(treeNode: ResolvedRepositoryNode, first: boolean, children: TreeNode[]) {
    this.el = el(
      'div',
      {
        id: treeNode.node._id,
        class: this.genClass(treeNode, first),
      },
      this.generateChildrenDom(treeNode, children),
    )
  }

  private generateChildrenDom(treeNode: ResolvedRepositoryNode, children: TreeNode[]) {
    return [
      el('div.nc',
        el('a', { href: `#node=${treeNode.node._id}` }, '•'), // &#8226;
        el('div.name', { contentEditable: true }, this.highlightName(treeNode.node.name)),
        el(`span.toggle`),
      ),
      el('div.children', children),
    ]
  }

  isIncludedInFilter(): boolean {
    return this.includedInFilter
  }

  getElement(): Element {
    return this.el
  }

  private highlightName(name: string): Element[] {
    // Only attempt to mark up search hits when we are included in the filter
    // and we actually have any hits ourselves (could be only our children have hits)
    if (this.isIncludedInFilter() && this.nameHits.length > 0) {
      const segments = []
      let pos = 0
      // tslint:disable-next-line:prefer-for-of
      for (let i = 0; i < this.nameHits.length; i++) {
        const hit = this.nameHits[i]
        if (pos !== hit.pos) {
          segments.push(text(name.slice(pos, hit.pos)))
        }
        pos = hit.pos + hit.length
        segments.push(el('mark', name.slice(hit.pos, pos)))
      }
      if (pos < name.length) {
        segments.push(text(name.slice(pos, name.length)))
      }
      return segments
    } else {
      return [text(name)]
    }
  }

  private isRoot(node: RepositoryNode): boolean {
    return node._id === 'ROOT'
  }

  private genClass(node: ResolvedRepositoryNode, isFirst: boolean): string {
    return 'node' + (this.isRoot(node.node) ? ' root' : '') + (isFirst ? ' first' : '') +
      (node.node.collapsed ? ' closed' : ' open')
  }

}

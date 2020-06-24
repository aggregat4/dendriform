export type MNodeContent = MNode[] | string

export class MNodeAttribute {
  constructor(readonly name: string, readonly value: string) {}
}

export class MNode {
  private _content: MNodeContent = undefined

  constructor(readonly tagName: string, readonly attributes: MNodeAttribute[], content?: MNodeContent) {
    this._content = content
  }

  set content(content: MNodeContent) {
    this._content = content
  }

  get content(): MNodeContent {
    return this._content
  }
}

/**
 * @implNote According to https://stackoverflow.com/a/29083467/1996 template strings are mostly faster than concatenation now?
 */
function getStartTag(node: MNode): string {
  if (! node.tagName) {
    return ''
  } else {
    let tag = `<${node.tagName}`
    for (const attribute of node.attributes) {
      tag += ` ${attribute.name}="${attribute.value}"`
    }
    return tag + '>'
  }
}

function getEndTag(node: MNode): string {
  if (node.tagName) {
    return `</${node.tagName}>`
  } else {
    return ''
  }
}

function getContent(node: MNode): string {
  if (typeof node.content === 'string') {
    return node.content
  } else {
    const children = node.content
    let value = ''
    for (const child of children) {
      value += toHtml(child)
    }
    return value
  }
}

export function toHtml(node: MNode): string {
  return getStartTag(node) + getContent(node) + getEndTag(node)
}

class Markup {
  constructor(readonly regex: RegExp, readonly markFun: (s: string) => MNode) {}
}

function findAndMarkText(node: MNode, markup: Markup): boolean {
  let hitFound = false
  if (typeof node.content === 'string') {
    let searchEl = node
    let reMatch: string[] = null
    let searchText: string = null
    while (searchEl && (searchText = (searchEl.content as string)) && searchText.length > 0 && (reMatch = markup.regex.exec(searchText))) {
      // The following two lines are a workaround for missing lookbehind assertions in JS (coming in ES2018)
      const matchedText = reMatch.length > 1 ? reMatch[1] : reMatch[0]
      const matchedIndex = reMatch.length > 1 ? reMatch.index + reMatch[0].length - reMatch[1].length : reMatch.index
      const beforeMatchNode = new MNode(null, [], searchText.substring(0, matchedIndex))
      const afterMatchNode = new MNode(null, [], searchText.substring(matchedIndex + matchedText.length))
      const markEl = markup.markFun(matchedText)
      searchEl.content = [beforeMatchNode, markEl, afterMatchNode]
      searchEl = afterMatchNode
      hitFound = true
    }
  } else {
    for (const child of (node.content as MNode[])) {
      const childHitFound = findAndMarkText(child, markup)
      hitFound = hitFound || childHitFound
    }
  }
  return hitFound
}

const linkMarkup = new Markup(
  new RegExp('[^\\s>]+://[^\\s]+'),
  (s) => new MNode(
    'a',
    [new MNodeAttribute('href', s), new MNodeAttribute('class', 'embeddedLink'), new MNodeAttribute('rel', 'noreferrer')],
    s))

const filterMarkup = new Markup(
  new RegExp('(?:^|\\s|>)([@#][\\w-]+)'),
  (s) => new MNode('span', [new MNodeAttribute('class', 'filterTag')], s))

const boldMarkup = new Markup(
  new RegExp('\\*\\*[^\\*]+\\*\\*'),
  (s) => new MNode('b', [], s))

const italicMarkup = new Markup(
  new RegExp('_[^_]+_'),
  (s) => new MNode('i', [], s))

function createFilterMarkTagMNode(s: string): MNode {
  return new MNode('mark', [], s)
}

export function markupHtml(rawHtml: string): MNode {
  return markupHtmlWithFilterHits(rawHtml, [])
}

export function markupHtmlWithFilterHits(rawHtml: string, filterStrings: string[]): MNode {
  const markedUp = new MNode(null, [], rawHtml)
  for (const filterString of filterStrings) {
    findAndMarkText(markedUp, new Markup(new RegExp(filterString, 'i'), createFilterMarkTagMNode))
  }
  findAndMarkText(markedUp, linkMarkup)
  findAndMarkText(markedUp, filterMarkup)
  findAndMarkText(markedUp, boldMarkup)
  findAndMarkText(markedUp, italicMarkup)
  return markedUp
}

const allMarkup = [linkMarkup, filterMarkup, boldMarkup, italicMarkup]

export function containsMarkup(text: string): boolean {
  for (const markup of allMarkup) {
    if (markup.regex.test(text)) {
      return true
    }
  }
  return false
}

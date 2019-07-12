
/**
 * This implementation for markup has a a workaround for missing lookbehind assertions in JS (coming in ES2018).
 * When a captured group exists we assume that the regex was structured to simulate lookbehind assertions.
 * In that case we only consider the text captured by the group to be linked, and we correct the matching
 * index to allow for the prefix that is not part of a group.
 *
 * This ONLY works if your regex contains mo matching characters AFTER your group! If you need lookahead,
 * then use that.
 */
export function findAndMarkText(element: any, regex: RegExp, marker: (s) => Element): boolean {
  let hitFound = false
  if (element.nodeType === Node.TEXT_NODE) {
    let searchEl = element
    let reMatch = null
    while (searchEl && (reMatch = searchEl.nodeValue.match(regex))) {
      // The following two lines are a workaround for missing lookbehind assertions in JS (coming in ES2018)
      const matchedText = reMatch.length > 1 ? reMatch[1] : reMatch[0]
      const matchedIndex = reMatch.length > 1 ? reMatch.index + reMatch[0].length - reMatch[1].length : reMatch.index
      const newEl = searchEl.splitText(matchedIndex)
      searchEl = newEl.splitText(matchedText.length)
      const markEl = marker(matchedText)
      element.parentNode.replaceChild(markEl, newEl)
      hitFound = true
    }
  } else if (element.childNodes) {
    for (const child of element.childNodes) {
      hitFound = hitFound || findAndMarkText(child, regex, marker)
    }
  }
  return hitFound
}

export type MNodeContent = MNode[] | string

export const enum MNodeType {
  DOCUMENT,
  TEXT,
  SPAN,
  A,
  I,
  B,
  MARK,
}

export class MNodeAttribute {toHtml
  constructor(readonly name: string, readonly value: string) {}
}

export class MNode {
  private _content = undefined
  constructor(readonly type: MNodeType, readonly attributes: MNodeAttribute[], content?: MNodeContent) {
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
  if (node.type === MNodeType.DOCUMENT || node.type === MNodeType.TEXT) {
    return ''
  }
  let tag = '<'
  switch (node.type) {
    case MNodeType.A: {
      tag += 'a'
      break
    }
    case MNodeType.B: {
      tag += 'b'
      break
    }
    case MNodeType.I: {
      tag += 'i'
      break
    }
    case MNodeType.SPAN: {
      tag += 'span'
      break
    }
    case MNodeType.MARK: {
      tag += 'mark'
      break
    }
  }
  for (const attribute of node.attributes) {
    tag += ` ${attribute.name}="${attribute.value}"`
  }
  return tag + '>'
}

function getEndTag(node: MNode): string {
  switch (node.type) {
    case MNodeType.DOCUMENT:
    case MNodeType.TEXT: return ''
    case MNodeType.A: return '</a>'
    case MNodeType.B: return '</b>'
    case MNodeType.I: return '</i>'
    case MNodeType.SPAN: return '</span>'
    case MNodeType.MARK: return '</mark>'
  }
}

function getContent(node: MNode): string {
  if (typeof node.content === 'string') {
    return node.content as string
  } else {
    const children = node.content as MNode[]
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

export function findAndMarkTextMNode(node: MNode, regex: RegExp, marker: (s) => MNode): boolean {
  let hitFound = false
  if (typeof node.content === 'string') {
    let searchEl = node
    let reMatch = null
    let searchText = null
    while (searchEl && (searchText = (searchEl.content as string)) && searchText.length > 0 && (reMatch = searchText.match(regex))) {
      // The following two lines are a workaround for missing lookbehind assertions in JS (coming in ES2018)
      const matchedText = reMatch.length > 1 ? reMatch[1] : reMatch[0]
      const matchedIndex = reMatch.length > 1 ? reMatch.index + reMatch[0].length - reMatch[1].length : reMatch.index
      const beforeMatchNode = new MNode(MNodeType.TEXT, [], searchText.substring(0, matchedIndex))
      const afterMatchNode = new MNode(MNodeType.TEXT, [], searchText.substring(matchedIndex + matchedText.length))
      const markEl = marker(matchedText)
      searchEl.content = [beforeMatchNode, markEl, afterMatchNode]
      searchEl = afterMatchNode
      hitFound = true
    }
  } else {
    console.log('Entering non string branch of markup')
    for (const child of (node.content as MNode[])) {
      hitFound = hitFound || findAndMarkTextMNode(child, regex, marker)
    }
  }
  return hitFound
}

export function countNonTextNodes(el: Node): number {
  let count = 0
  for (const child of el.childNodes) {
    if (child.nodeType !== Node.TEXT_NODE) {
      count++
    }
    count += countNonTextNodes(child)
  }
  return count
}

// TODO: does this belong here?
export const linkRegexp = new RegExp('[^\\s]+://[^\\s]+')
function createLink(s: string): Element {
  const el = document.createElement('a')
  el.setAttribute('href', s)
  el.setAttribute('class', 'embeddedLink')
  el.setAttribute('rel', 'noreferrer')
  el.innerHTML = s
  return el
}
export function createLinkMNode(s: string): MNode {
  return new MNode(
    MNodeType.A,
    [new MNodeAttribute('href', s), new MNodeAttribute('class', 'embeddedLink'), new MNodeAttribute('rel', 'noreferrer')],
    s)
}

export const filterRegexp = new RegExp('\\s([@#][\\w-]+)')
function createFilterLink(s: string): Element {
  const el = document.createElement('span')
  el.setAttribute('class', 'filterTag')
  el.innerHTML = s
  return el
}
export function createFilterLinkMNode(s: string): MNode {
  return new MNode(MNodeType.SPAN, [new MNodeAttribute('class', 'filterTag')], s)
}

export const boldRegexp = new RegExp('\\*\\*[^\\*]+\\*\\*')
function createBoldTag(s: string): Element {
  const el = document.createElement('b')
  el.innerHTML = s
  return el
}
export function createBoldTagMNode(s: string): MNode {
  return new MNode(MNodeType.B, [], s)
}

export const italicRegexp = new RegExp('_[^_]+_')
function createItalicTag(s: string): Element {
  const el = document.createElement('i')
  el.innerHTML = s
  return el
}
export function createItalicTagMNode(s: string): MNode {
  return new MNode(MNodeType.I, [], s)
}

function createFilterMarkTagMNode(s: string): MNode {
  return new MNode(MNodeType.MARK, [], s)
}

// TODO: if we are really going to use this for formatting styles then we need something better than this
// poor man's markup engine. This makes many passes and nested markup is not possible.
export function markupHtml(rawHtml: string): DocumentFragment {
  const fragment = document.createRange().createContextualFragment(rawHtml)
  // identify links, hashtags and @mentions to autolink
  findAndMarkText(fragment, linkRegexp, createLink)
  findAndMarkText(fragment, filterRegexp, createFilterLink)
  findAndMarkText(fragment, boldRegexp, createBoldTag)
  findAndMarkText(fragment, italicRegexp, createItalicTag)
  return fragment
}

export function markupHtmlMNode(rawHtml: string): MNode {
  return markupHtmlMNodeWithFilterHits(rawHtml, [])
}

export function markupHtmlMNodeWithFilterHits(rawHtml: string, filterStrings: string[]): MNode {
  const markedUp = new MNode(MNodeType.DOCUMENT, [], rawHtml)
  for (const filterString of filterStrings) {
    findAndMarkTextMNode(markedUp, new RegExp(filterString, 'i'), createFilterMarkTagMNode)
  }
  findAndMarkTextMNode(markedUp, linkRegexp, createLinkMNode)
  findAndMarkTextMNode(markedUp, filterRegexp, createFilterLinkMNode)
  findAndMarkTextMNode(markedUp, boldRegexp, createBoldTagMNode)
  findAndMarkTextMNode(markedUp, italicRegexp, createItalicTagMNode)
  return markedUp
}

const markupRegexes = [linkRegexp, filterRegexp, boldRegexp, italicRegexp]

export function containsMarkup(text: string): boolean {
  for (const regex of markupRegexes) {
    if (regex.test(text)) {
      return true
    }
  }
  return false
}

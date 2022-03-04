export type Predicate<T> = (_: T) => boolean

export const ALWAYS_TRUE: Predicate<never> = () => true

export function createCompositeAndPredicate<T>(predicates: Predicate<T>[]): Predicate<T> {
  return (value: T) => {
    for (const predicate of predicates) {
      if (!predicate(value)) {
        return false
      }
    }
    return true
  }
}

export function isEmpty(str: string): boolean {
  return !str || str.trim() === ''
}

// from https://davidwalsh.name/javascript-debounce-function
export function debounce(
  f: (...args: unknown[]) => void,
  wait: number,
  immediate?: boolean
): (...args: unknown[]) => void {
  let timeout
  return (...args2: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-this-alias, @typescript-eslint/no-unsafe-assignment
    const context = this
    const later = () => {
      timeout = null
      if (!immediate) {
        f.apply(context, args2)
      }
    }
    const callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    if (callNow) {
      f.apply(context, args2)
    }
  }
}

export function getCursorPos(): number {
  const selection = window.getSelection()
  if (selection.rangeCount) {
    return selection.getRangeAt(0).endOffset
  } else {
    return -1
  }
}

/** From https://stackoverflow.com/a/41034697/1996 */
function isChildOf(node: Node, parent: Node) {
  let currentNode = node
  while (currentNode !== null) {
    if (currentNode === parent) {
      return true
    }
    currentNode = currentNode.parentNode
  }
  return false
}

/** From https://stackoverflow.com/a/41034697/1996 */
export function getCursorPosAcrossMarkup(parent: Element): number {
  const selection = window.getSelection()
  let charCount = -1
  let node: Node = null
  if (selection.focusNode) {
    if (isChildOf(selection.focusNode, parent)) {
      node = selection.focusNode
      charCount = selection.focusOffset
      while (node) {
        if (node === parent) {
          break
        }
        if (node.previousSibling) {
          node = node.previousSibling
          charCount += node.textContent.length
        } else {
          node = node.parentNode
          if (node === null) {
            break
          }
        }
      }
    }
  }
  return charCount
}

// This function tries to determine whether the caret is at the actual beginning
// of a contenteditable field. This is non trivial since the contenteditable can contain
// multiple lines and we need to find the line boundary first
export function isCursorAtContentEditableBeginning(outerElementClass: string): boolean {
  const selection = window.getSelection()
  if (selection.rangeCount && selection.focusNode) {
    const focusNode = selection.focusNode
    if (
      (focusNode as Element).classList &&
      (focusNode as Element).classList.contains(outerElementClass)
    ) {
      return false // we are apparently already in the parent element
    }
    if (isCursorAtContentEditableFirstLine(focusNode as Element, outerElementClass)) {
      return getCursorPos() === 0
    }
  }
  return false
}

function isCursorAtContentEditableFirstLine(
  focusNode: Element,
  outerElementClass: string
): boolean {
  if (
    focusNode.nodeType === Node.TEXT_NODE &&
    focusNode.parentElement.classList.contains(outerElementClass)
  ) {
    return true
  } else {
    // 1. find the first parent whose parent is the outerElementClass
    // 2. if that parent has previoussiblings then we are not at the beginning
    let lineNodeCandidate = focusNode
    while (
      lineNodeCandidate.parentElement &&
      !lineNodeCandidate.parentElement.classList.contains(outerElementClass)
    ) {
      lineNodeCandidate = lineNodeCandidate.parentElement
    }
    if (lineNodeCandidate.parentElement) {
      // It is imperative that we check previousSibling instead of previousElementSibling
      // since a contentEditable can have a textNode as the first element followed
      // by a div containing a text node (generated with a newline). This means that
      // the previous sibling of the second line is NOT an Element but a TextNode
      if (lineNodeCandidate.previousSibling) {
        return false
      } else {
        return true // our focusNode is apparently on the first line
      }
    } else {
      throw new Error(
        `Can not determine whether we are at the beginning of a contenteditable ` +
          `since the provided node is not inside another node with the provided outerElementclass`
      )
    }
  }
}

/** From https://stackoverflow.com/a/41034697/1996 */
export function setCursorPosAcrossMarkup(el: Element, chars: number): void {
  if (chars >= 0) {
    const selection = window.getSelection()
    const range = createRange(el, chars, undefined)
    if (range) {
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }
}

/** From https://stackoverflow.com/a/41034697/1996 */
function createRange(node: Node, count: number, range: Range): Range {
  if (!range) {
    range = document.createRange()
    range.selectNode(node)
    range.setStart(node, 0)
  }
  let newCount = count
  if (newCount === 0) {
    range.setEnd(node, newCount)
  } else if (node && newCount > 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.length < newCount) {
        newCount -= node.textContent.length
      } else {
        range.setEnd(node, newCount)
        newCount = 0
      }
    } else {
      for (let lp = 0; lp < node.childNodes.length; lp++) {
        range = createRange(node.childNodes[lp], newCount, range)
        if (newCount === 0) {
          break
        }
      }
    }
  }
  return range
}

export function isCursorAtEnd(kbdevent: Event): boolean {
  return getCursorPos() === (kbdevent.target as HTMLElement).textContent.length
}

export function isCursorAtBeginning(): boolean {
  return getCursorPos() === 0
}

export function getTextBeforeCursor(kbdevent: Event): string {
  const selection = window.getSelection()
  if (selection.rangeCount) {
    const selectionRange = selection.getRangeAt(0)
    const rangeBeforeCursor = selectionRange.cloneRange()
    rangeBeforeCursor.selectNodeContents(kbdevent.target as HTMLElement)
    rangeBeforeCursor.setEnd(selectionRange.endContainer, selectionRange.endOffset)
    return rangeBeforeCursor.toString()
  } else {
    return null
  }
}

export function getTextAfterCursor(kbdevent: Event): string {
  const selection = window.getSelection()
  if (selection.rangeCount) {
    const selectionRange = selection.getRangeAt(0)
    const rangeAfterCursor = selectionRange.cloneRange()
    rangeAfterCursor.selectNodeContents(kbdevent.target as HTMLElement)
    rangeAfterCursor.setStart(selectionRange.endContainer, selectionRange.endOffset)
    return rangeAfterCursor.extractContents().textContent
  } else {
    return null
  }
}

// From https://stackoverflow.com/a/8809472/1996
// Public Domain/MIT
export function generateUUID(): string {
  let d = new Date().getTime()
  // use high-precision timer if available
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    d += performance.now()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    // tslint:disable-next-line:no-bitwise
    const r = (d + Math.random() * 16) % 16 | 0
    d = Math.floor(d / 16)
    // tslint:disable-next-line:no-bitwise
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function isTextSelected(): boolean {
  const selection = window.getSelection()
  // The Selection specification is a mess, ancient stuff:
  // https://www.w3.org/TR/selection-api/#h_note_15
  // As far as I can tell we are guaranteed to always have
  // a range and checking the begin and start offsets of that
  // range seem the most efficient way to check whether the selection
  // is empty or not.
  return !!selection && selection.getRangeAt(0).startOffset !== selection.getRangeAt(0).endOffset
}

// a way to remove formatting from pasted content
export function pasteTextUnformatted(event: ClipboardEvent): void {
  const text = event.clipboardData.getData('text/plain')
  document.execCommand('insertHTML', false, text)
}

export function findFirst<T>(array: T[], predicate: (arg: T) => boolean): T {
  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i])) {
      return array[i]
    }
  }
  return null
}

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message || 'Assertion failed')
  }
}

export function assertNonEmptyString(str: string): void {
  return assert(!(str === undefined || str === null || str === ''), 'String must not be empty')
}

const macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K']
const windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE']
const iosPlatforms = ['iPhone', 'iPad', 'iPod']

export const enum OperatingSystem {
  MacOs = 'MacOs',
  Linux = 'Linux',
  Windows = 'Windows',
  Android = 'Android',
  Ios = 'Ios',
}

export function guessOperatingSystem(): OperatingSystem {
  const userAgent = window?.navigator?.userAgent || ''
  const platform = window?.navigator?.platform || ''
  if (macosPlatforms.indexOf(platform) !== -1) {
    return OperatingSystem.MacOs
  } else if (iosPlatforms.indexOf(platform) !== -1) {
    return OperatingSystem.Ios
  } else if (windowsPlatforms.indexOf(platform) !== -1) {
    return OperatingSystem.Windows
  } else if (/Android/.test(userAgent)) {
    return OperatingSystem.Android
  } else if (/Linux/.test(platform)) {
    return OperatingSystem.Linux
  } else {
    return OperatingSystem.Windows
  }
}

export function parseXML(content: string): Document {
  const parser = new DOMParser()
  const doc = parser.parseFromString(content, 'application/xml')
  // TODO: DOMParser returns an error document instead of throwing an exception on parsing, catch that
  return doc
}

// Signals as per https://www.davideaversa.it/blog/simple-event-system-typescript/
// MIT License as per https://gist.github.com/THeK3nger/7a68b9b05d592b78d641375e4a560c10
interface ISignal<S, T> {
  on(handler: (source: S, data: T) => void): void
  off(handler: (source: S, data: T) => void): void
}

export class Signal<S, T> implements ISignal<S, T> {
  private handlers: Array<(source: S, data: T) => void> = []

  public on(handler: (source: S, data: T) => void): void {
    this.handlers.push(handler)
  }

  public off(handler: (source: S, data: T) => void): void {
    this.handlers = this.handlers.filter((h) => h !== handler)
  }

  public trigger(source: S, data: T): void {
    // Duplicate the array to avoid side effects during iteration.
    this.handlers.slice(0).forEach((h) => h(source, data))
  }

  public expose(): ISignal<S, T> {
    return this
  }
}

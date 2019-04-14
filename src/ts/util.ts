export type Predicate<T> = (_: T) => boolean

export function ALWAYS_TRUE(foo: any) { return true }

export function isEmpty(str: string): boolean {
  return !str || str.trim() === ''
}

// from https://davidwalsh.name/javascript-debounce-function
export function debounce(f: (...args: any[]) => void, wait: number, immediate?: boolean): (...args: any[]) => void {
  let timeout
  return (...args2: any[]) => {
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

/**
 * From https://stackoverflow.com/a/41034697/1996
 */
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

/**
 * From https://stackoverflow.com/a/41034697/1996
 */
export function getCursorPosAcrossMarkup(parent: Element) {
  const selection = window.getSelection()
  let charCount = -1
  let node = null
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
    if ((focusNode as Element).classList && (focusNode as Element).classList.contains(outerElementClass)) {
      return false // we are apparently already in the parent element
    }
    if (isCursorAtContentEditableFirstLine(focusNode as Element, outerElementClass)) {
      return getCursorPos() === 0
    }
  }
  return false
}

function isCursorAtContentEditableFirstLine(focusNode: Element, outerElementClass: string): boolean {
  if (focusNode.nodeType === Node.TEXT_NODE && focusNode.parentElement.classList.contains(outerElementClass)) {
    return true
  } else {
    // 1. find the first parent whose parent is the outerElementClass
    // 2. if that parent has previoussiblings then we are not at the beginning
    let lineNodeCandidate = focusNode
    while (lineNodeCandidate.parentElement && !lineNodeCandidate.parentElement.classList.contains(outerElementClass)) {
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
      throw new Error(`Can not determine whether we are at the beginning of a contenteditable ` +
                      `since the provided node is not inside another node with the provided outerElementclass`)
    }
  }
}

// NOTE this assumes that the element has only one textContent child as child 0, no rich content!
export function setCursorPos(el: Element, charPos: number): void {
  if (!el.childNodes[0]) {
    return
  }
  const range = document.createRange()
  range.setStart(el.childNodes[0], charPos)
  range.setEnd(el.childNodes[0], charPos)
  // range.collapse(true)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

/**
 * From https://stackoverflow.com/a/41034697/1996
 */
export function setCursorPosAcrossMarkup(el: Element, chars: number): void {
  if (chars >= 0) {
    const selection = window.getSelection()
    const range = createRange(el, { count: chars }, undefined)
    if (range) {
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }
}

/**
 * From https://stackoverflow.com/a/41034697/1996
 */
function createRange(node, chars, range) {
  if (!range) {
    range = document.createRange()
    range.selectNode(node)
    range.setStart(node, 0)
  }
  if (chars.count === 0) {
    range.setEnd(node, chars.count)
  } else if (node && chars.count > 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.length < chars.count) {
        chars.count -= node.textContent.length
      } else {
        range.setEnd(node, chars.count)
        chars.count = 0
      }
    } else {
      for (let lp = 0; lp < node.childNodes.length; lp++) {
        range = createRange(node.childNodes[lp], chars, range)
        if (chars.count === 0) {
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
export function generateUUID() {
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
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
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

export function findFirst(array: any[], predicate: (any) => boolean): any {
  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i])) {
      return array[i]
    }
  }
  return null
}

const fail = Symbol()

export async function filterAsync(arr, callback) {
  return (await Promise.all(arr.map(async item => (await callback(item)) ? item : fail))).filter(i => i !== fail)
}

export async function findFirstAsync(array: any[], predicate: (any) => Promise<boolean>): Promise<any> {
  for (let i = 0; i < array.length; i++) {
    if (await predicate(array[i])) {
      return Promise.resolve(array[i])
    }
  }
  return Promise.resolve(null)
}

export function assert(condition, message: string): void {
  if (!condition) {
    throw new Error(message || 'Assertion failed')
  }
}

export function assertNonEmptyString(str: string): void {
  if (str === undefined || str === null || str === '' ) {
    throw new Error('String must no be empty')
  }
}

const macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K']
const windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE']
const iosPlatforms = ['iPhone', 'iPad', 'iPod']

export enum OperatingSystem { MacOs = 'MacOs', Linux = 'Linux', Windows = 'Windows', Android = 'Android', Ios = 'Ios' }

export function guessOperatingSystem(): OperatingSystem {
  const userAgent = window.navigator.userAgent
  const platform = window.navigator.platform
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

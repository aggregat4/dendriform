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
export function setCursorPos(el: HTMLElement, charPos: number): void {
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

export function isCursorAtEnd(kbdevent: KeyboardEvent): boolean {
  return getCursorPos() === (kbdevent.target as HTMLElement).textContent.length
}

export function isCursorAtBeginning(kbdevent: KeyboardEvent): boolean {
  return getCursorPos() === 0
}

export function getTextBeforeCursor(kbdevent: KeyboardEvent): string {
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

export function getTextAfterCursor(kbdevent: KeyboardEvent): string {
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
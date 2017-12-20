export function isEmpty (str: string) : boolean {
  return (!str || str.length === 0)
}

export function getHashValue (key: string) : string {
  const matches = window.location.hash.match(new RegExp(`${key}=([^&]*)?`))
  return matches && matches.length >= 2 ? matches[1] : null
}

// from https://davidwalsh.name/javascript-debounce-function
export function debounce (func, wait : number, immediate: boolean) {
  let timeout
  return function () {
    const context = this
    const args = arguments
    var later = function () {
      timeout = null
      if (!immediate) func.apply(context, args)
    }
    var callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    if (callNow) func.apply(context, args)
  }
}

export function getCursorPos () : number {
  const selection = window.getSelection()
  if (selection.rangeCount) {
    const selectionRange = selection.getRangeAt(0)
    return selectionRange.endOffset
  } else {
    return -1
  }
}

// NOTE this assumes that the element has only one textContent child as child 0, no rich content!
export function setCursorPos (el: HTMLElement, charPos: number) : void {
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

export function isCursorAtEnd (kbdevent: KeyboardEvent) : boolean {
  return getCursorPos() === (kbdevent.target as HTMLElement).textContent.length
}

export function isCursorAtBeginning (kbdevent: KeyboardEvent) : boolean {
  return getCursorPos() === 0
}

export function getTextBeforeCursor (kbdevent: KeyboardEvent) : string {
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

export function getTextAfterCursor (kbdevent: KeyboardEvent) : string {
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
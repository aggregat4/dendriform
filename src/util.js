export function isEmpty (str) {
  return (!str || str.length === 0)
}

export function getHashValue (key) {
  const matches = window.location.hash.match(new RegExp(`${key}=([^&]*)?`))
  return matches && matches.length >= 2 ? matches[1] : null
}

// from https://davidwalsh.name/javascript-debounce-function
export function debounce (func, wait, immediate) {
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

import { test } from '../lib/tizzy'
import expect from 'ceylon'

import { toHtml, markupHtml, markupHtmlIncludingFilterHits } from '../src/ts/utils/markup'

// describe('markupMNode marks up text correctly', () => {

test('empty DOCUMENT node markup', () => {
  const node = markupHtml('')
  expect(node.content).toBe('')
  expect(node.attributes).toEqual([])
})

test('nonempty DOCUMENT node markup with NO match', () => {
  const node = markupHtml('foobar')
  expect(node.content).toBe('foobar')
  expect(node.attributes).toEqual([])
})

test('a link match', () => {
  const node = markupHtml('foo http://example.com')
  expect(toHtml(node)).toBe(
    'foo <a href="http://example.com" class="embeddedLink" rel="noreferrer">http://example.com</a>'
  )
})

test('a b match', () => {
  const node = markupHtml('foo **foo** bar')
  expect(toHtml(node)).toBe('foo <b>**foo**</b> bar')
})

test('an i match', () => {
  const node = markupHtml('foo _foo_ bar')
  expect(toHtml(node)).toBe('foo <i>_foo_</i> bar')
})

test('filter match', () => {
  const node = markupHtml('foo #foo and @qux bar')
  expect(toHtml(node)).toBe(
    'foo <span class="filterTag">#foo</span> and <span class="filterTag">@qux</span> bar'
  )
})

test('a filter match at beginning of line', () => {
  const node = markupHtml('#foo bar')
  expect(toHtml(node)).toBe('<span class="filterTag">#foo</span> bar')
})

test('a filter hit followed by a tag', () => {
  const node = markupHtmlIncludingFilterHits('findme #foo bar', ['findme'])
  expect(toHtml(node)).toBe('<mark>findme</mark> <span class="filterTag">#foo</span> bar')
})

test('a tag followed by a filter hit followed by a tag', () => {
  const node = markupHtmlIncludingFilterHits('@me findme #foo bar', ['findme'])
  expect(toHtml(node)).toBe(
    '<span class="filterTag">@me</span> <mark>findme</mark> <span class="filterTag">#foo</span> bar'
  )
})
// TODO: test edge cases and combinations

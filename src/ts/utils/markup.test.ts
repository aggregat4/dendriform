import { toHtml, markupHtml } from './markup'

describe('markupMNode marks up text correctly', () => {

  test('empty DOCUMENT node markup', () => {
    const node = markupHtml('')
    expect(node.content).toBe('')
    expect(node.attributes).toStrictEqual([])
  })

  test('nonempty DOCUMENT node markup with NO match', () => {
    const node = markupHtml('foobar')
    expect(node.content).toBe('foobar')
    expect(node.attributes).toStrictEqual([])
  })

  test('nonempty DOCUMENT with a link match', () => {
    const node = markupHtml('foo http://example.com')
    expect(toHtml(node)).toBe('foo <a href="http://example.com" class="embeddedLink" rel="noreferrer">http://example.com</a>')
  })

  test('nonempty DOCUMENT with a b match', () => {
    const node = markupHtml('foo **foo** bar')
    expect(toHtml(node)).toBe('foo <b>**foo**</b> bar')
  })

  test('nonempty DOCUMENT with an i match', () => {
    const node = markupHtml('foo _foo_ bar')
    expect(toHtml(node)).toBe('foo <i>_foo_</i> bar')
  })

  test('nonempty DOCUMENT with a filter match', () => {
    const node = markupHtml('foo #foo and @qux bar')
    expect(toHtml(node)).toBe('foo <span class="filterTag">#foo</span> and <span class="filterTag">@qux</span> bar')
  })

  test('nonempty DOCUMENT with a filter match at beginning of line', () => {
    const node = markupHtml('#foo bar')
    expect(toHtml(node)).toBe('<span class="filterTag">#foo</span> bar')
  })

  // TODO: test edge cases and combinations
})

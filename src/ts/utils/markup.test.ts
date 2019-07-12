import { findAndMarkTextMNode, MNode, MNodeType, linkRegexp, createLinkMNode, toHtml, boldRegexp, createBoldTagMNode, filterRegexp, createFilterLinkMNode, createItalicTagMNode, italicRegexp } from './markup'

describe('markupMNode marks up text correctly', () => {

  const noopRegex = new RegExp('QWIEUQZWIEOUQZWEOIUQZWEOIQUWZOIQUWE')
  const noopMarker = (s) => new MNode(MNodeType.TEXT, [], s)

  test('empty DOCUMENT node markup', () => {
    const node = new MNode(MNodeType.DOCUMENT, [], '')
    findAndMarkTextMNode(node, noopRegex , noopMarker)
    expect(node.type).toBe(MNodeType.DOCUMENT)
    expect(node.content).toBe('')
    expect(node.attributes).toStrictEqual([])
  })

  test('nonempty DOCUMENT node markup with NO match', () => {
    const node = new MNode(MNodeType.DOCUMENT, [], 'foobar')
    findAndMarkTextMNode(node, noopRegex , noopMarker)
    expect(node.type).toBe(MNodeType.DOCUMENT)
    expect(node.content).toBe('foobar')
    expect(node.attributes).toStrictEqual([])
  })

  test('nonempty DOCUMENT with a link match', () => {
    const node = new MNode(MNodeType.DOCUMENT, [], 'foo http://example.com')
    findAndMarkTextMNode(node, linkRegexp, createLinkMNode)
    expect(toHtml(node)).toBe('foo <a href="http://example.com" class="embeddedLink" rel="noreferrer">http://example.com</a>')
  })

  test('nonempty DOCUMENT with a b match', () => {
    const node = new MNode(MNodeType.DOCUMENT, [], 'foo **foo** bar')
    findAndMarkTextMNode(node, boldRegexp, createBoldTagMNode)
    expect(toHtml(node)).toBe('foo <b>**foo**</b> bar')
  })

  test('nonempty DOCUMENT with an i match', () => {
    const node = new MNode(MNodeType.DOCUMENT, [], 'foo _foo_ bar')
    findAndMarkTextMNode(node, italicRegexp, createItalicTagMNode)
    expect(toHtml(node)).toBe('foo <i>_foo_</i> bar')
  })

  test('nonempty DOCUMENT with a filter match', () => {
    const node = new MNode(MNodeType.DOCUMENT, [], 'foo #foo and @qux bar')
    findAndMarkTextMNode(node, filterRegexp, createFilterLinkMNode)
    expect(toHtml(node)).toBe('foo <span class="filterTag">#foo</span> and <span class="filterTag">@qux</span> bar')
  })
// TODO: test edge cases and combinations
})

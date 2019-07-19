import { parseQuery } from './domain-search'
import { QueryComponent } from './domain'

describe('query parsing works', () => {

  test('empty query', () => {
    expect(parseQuery('')).toStrictEqual([])
  })

  test('only whitespace', () => {
    expect(parseQuery('   ')).toStrictEqual([])
  })

  test('one character', () => {
    expect(parseQuery('a')).toStrictEqual([new QueryComponent('a')])
  })

  test('a word', () => {
    expect(parseQuery('foobar')).toStrictEqual([new QueryComponent('foobar')])
  })

  test('a word preceded by space', () => {
    expect(parseQuery(' foobar')).toStrictEqual([new QueryComponent('foobar')])
  })

  test('two words', () => {
    expect(parseQuery('foo bar')).toStrictEqual([new QueryComponent('foo'), new QueryComponent('bar')])
  })

})

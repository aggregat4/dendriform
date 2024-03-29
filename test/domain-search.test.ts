import { test } from '../lib/tizzy'
import expect from 'ceylon'

import { parseQuery, QueryComponent } from '../src/ts/repository/search'

test('Query parsing empty query', () => {
  expect(parseQuery('')).toEqual([])
})

test('Query parsing only whitespace', () => {
  expect(parseQuery('   ')).toEqual([])
})

test('Query parsing one character', () => {
  expect(parseQuery('a')).toEqual([new QueryComponent('a')])
})

test('Query parsing a word', () => {
  expect(parseQuery('foobar')).toEqual([new QueryComponent('foobar')])
})

test('Query parsing a word preceded by space', () => {
  expect(parseQuery(' foobar')).toEqual([new QueryComponent('foobar')])
})

test('Query parsing two words', () => {
  expect(parseQuery('foo bar')).toEqual([new QueryComponent('foo'), new QueryComponent('bar')])
})

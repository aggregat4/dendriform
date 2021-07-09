import { test } from '../lib/tizzytest'
import expect from 'ceylon'

import { LogootSequenceWrapper } from '../src/ts/repository/logoot-sequence-wrapper'

// describe('logoot sequences have invariants', () => {

test('empty sequences are empty', () => {
  const seq = new LogootSequenceWrapper('a')
  expect(seq.toArray()).toEqual([])
})

test('empty sequences have length 0', () => {
  const seq = new LogootSequenceWrapper('a')
  expect(seq.length()).toEqual(0)
})

// describe('logoot sequences can be modified with atomIdents', () => {
test('inserting one element in an empty sequence', () => {
  const seq = new LogootSequenceWrapper('a')
  const atomIdent = seq.getAtomIdentForInsertionIndex(0, 1)
  seq.insertAtAtomIdent('foo', atomIdent)
  expect(seq.toArray()).toEqual(['foo'])
})

test('inserting multiple elements in an empty sequence at the same position', () => {
  const seq = new LogootSequenceWrapper('a')
  const atomIdent1 = seq.getAtomIdentForInsertionIndex(0, 1)
  seq.insertAtAtomIdent('foo', atomIdent1)
  const atomIdent2 = seq.getAtomIdentForInsertionIndex(0, 2)
  seq.insertAtAtomIdent('bar', atomIdent2)
  const atomIdent3 = seq.getAtomIdentForInsertionIndex(0, 3)
  seq.insertAtAtomIdent('baz', atomIdent3)
  expect(seq.toArray()).toEqual(['baz', 'bar', 'foo'])
})

test('inserting multiple elements in an empty sequence at different position', () => {
  const seq = new LogootSequenceWrapper('a')
  const atomIdent1 = seq.getAtomIdentForInsertionIndex(0, 1)
  seq.insertAtAtomIdent('foo', atomIdent1)
  const atomIdent2 = seq.getAtomIdentForInsertionIndex(1, 2)
  seq.insertAtAtomIdent('bar', atomIdent2)
  const atomIdent3 = seq.getAtomIdentForInsertionIndex(2, 3)
  seq.insertAtAtomIdent('baz', atomIdent3)
  expect(seq.toArray()).toEqual(['foo', 'bar', 'baz'])
})

test('inserting one element and deleting it again', () => {
  const seq = new LogootSequenceWrapper('a')
  const atomIdent = seq.getAtomIdentForInsertionIndex(0, 1)
  seq.insertAtAtomIdent('foo', atomIdent)
  seq.deleteAtAtomIdent(atomIdent)
  expect(seq.toArray()).toEqual([])
  expect(seq.length()).toEqual(0)
})

test('inserting two elements and deleting one', () => {
  const seq = new LogootSequenceWrapper('a')
  const atomIdent1 = seq.getAtomIdentForInsertionIndex(0, 1)
  seq.insertAtAtomIdent('foo', atomIdent1)
  const atomIdent2 = seq.getAtomIdentForInsertionIndex(0, 2)
  seq.insertAtAtomIdent('bar', atomIdent2)
  seq.deleteAtAtomIdent(atomIdent1)
  expect(seq.toArray()).toEqual(['bar'])
})

// // describe('logoot sequences can be modified with indices', () => {

// test('inserting one element in an empty sequence', () => {
//   const seq = new LogootSequenceWrapper('a')
//   seq.insertAtIndex('foo', 0, 1)
//   expect(seq.toArray()).toEqual(['foo'])
// })

// test('inserting multiple elements in an empty sequence', () => {
//   const seq = new LogootSequenceWrapper('a')
//   seq.insertAtIndex('foo', 0, 1)
//   seq.insertAtIndex('bar', 0, 2)
//   seq.insertAtIndex('baz', 0, 3)
//   expect(seq.toArray()).toEqual(['baz', 'bar', 'foo'])
// })

// test('inserting one element and deleting it again', () => {
//   const seq = new LogootSequenceWrapper('a')
//   seq.insertAtIndex('foo', 0, 1)
//   seq.deleteAtIndex(0)
//   expect(seq.toArray()).toEqual([])
// })

// test('inserting two element and deleting one', () => {
//   const seq = new LogootSequenceWrapper('a')
//   seq.insertAtIndex('foo', 0, 1)
//   seq.insertAtIndex('bar', 0, 2)
//   seq.deleteAtIndex(0)
//   expect(seq.toArray()).toEqual(['foo'])
// })

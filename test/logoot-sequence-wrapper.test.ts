import { test } from '../lib/tizzy'
import expect from 'ceylon'

import { LogootSequenceWrapper } from '../src/ts/repository/logoot-sequence-wrapper'
import { RELATIVE_NODE_POSITION_END } from '../src/ts/domain/domain'

// describe('logoot sequences have invariants', () => {

test('empty sequences are empty', () => {
  const seq = new LogootSequenceWrapper()
  expect(seq.toArray()).toEqual([])
})

test('empty sequences have length 0', () => {
  const seq = new LogootSequenceWrapper()
  expect(seq.length()).toEqual(0)
})

// describe('logoot sequences can be modified with atomIdents', () => {
test('inserting one element in an empty sequence', () => {
  const seq = new LogootSequenceWrapper()
  const atomIdent = seq.getAtomIdentForInsertionIndex(0, 1, 'replica1')
  seq.insertAtAtomIdent('foo', atomIdent)
  expect(seq.toArray()).toEqual(['foo'])
})

test('inserting multiple elements in an empty sequence at the same position', () => {
  const seq = new LogootSequenceWrapper()
  const atomIdent1 = seq.getAtomIdentForInsertionIndex(0, 1, 'replica1')
  seq.insertAtAtomIdent('foo', atomIdent1)
  const atomIdent2 = seq.getAtomIdentForInsertionIndex(0, 2, 'replica1')
  seq.insertAtAtomIdent('bar', atomIdent2)
  const atomIdent3 = seq.getAtomIdentForInsertionIndex(0, 3, 'replica1')
  seq.insertAtAtomIdent('baz', atomIdent3)
  expect(seq.toArray()).toEqual(['baz', 'bar', 'foo'])
})

test('inserting multiple elements in an empty sequence at different position', () => {
  const seq = new LogootSequenceWrapper()
  const atomIdent1 = seq.getAtomIdentForInsertionIndex(0, 1, 'replica1')
  seq.insertAtAtomIdent('foo', atomIdent1)
  const atomIdent2 = seq.getAtomIdentForInsertionIndex(1, 2, 'replica1')
  seq.insertAtAtomIdent('bar', atomIdent2)
  const atomIdent3 = seq.getAtomIdentForInsertionIndex(2, 3, 'replica1')
  seq.insertAtAtomIdent('baz', atomIdent3)
  expect(seq.toArray()).toEqual(['foo', 'bar', 'baz'])
})

test('inserting one element and deleting it again', () => {
  const seq = new LogootSequenceWrapper()
  const atomIdent = seq.getAtomIdentForInsertionIndex(0, 1, 'replica1')
  seq.insertAtAtomIdent('foo', atomIdent)
  seq.deleteAtAtomIdent(atomIdent)
  expect(seq.toArray()).toEqual([])
  expect(seq.length()).toEqual(0)
})

test('inserting two elements and deleting one', () => {
  const seq = new LogootSequenceWrapper()
  const atomIdent1 = seq.getAtomIdentForInsertionIndex(0, 1, 'replica1')
  seq.insertAtAtomIdent('foo', atomIdent1)
  const atomIdent2 = seq.getAtomIdentForInsertionIndex(0, 2, 'replica1')
  seq.insertAtAtomIdent('bar', atomIdent2)
  seq.deleteAtAtomIdent(atomIdent1)
  expect(seq.toArray()).toEqual(['bar'])
})

test('deleting an element by id', () => {
  const seq = new LogootSequenceWrapper()
  seq.insertElement('foo', RELATIVE_NODE_POSITION_END, 1, 'replica1')
  seq.insertElement('bar', RELATIVE_NODE_POSITION_END, 2, 'replica1')
  seq.deleteElement('foo')
  expect(seq.toArray()).toEqual(['bar'])
  seq.insertElement('foo', RELATIVE_NODE_POSITION_END, 1, 'replica1')
  seq.insertElement('qux', RELATIVE_NODE_POSITION_END, 1, 'replica1')
  expect(seq.toArray()).toEqual(['bar', 'foo', 'qux'])
  seq.deleteElement('foo')
  expect(seq.toArray()).toEqual(['bar', 'qux'])
})

import {LogootSequenceWrapper} from './logoot-sequence-wrapper'

describe('logoot sequences can have elements inserted at the right place', () => {
  test('empty sequences are empty', () => {
    const seq = new LogootSequenceWrapper('a')
    const atomIdent = seq.getAtomIdentForInsertionIndex(0, 1)
    seq.insertAtAtomIdent('foo', atomIdent)
    expect(seq.toArray()).toEqual(['foo'])
  })

  test('inserting (using atomIdents) one element in an empty sequence', () => {
    const seq = new LogootSequenceWrapper('a')
    const atomIdent = seq.getAtomIdentForInsertionIndex(0, 1)
    seq.insertAtAtomIdent('foo', atomIdent)
    expect(seq.toArray()).toEqual(['foo'])
  })

  test('inserting (using atomIdents) multiple elements in an empty sequence', () => {
    const seq = new LogootSequenceWrapper('a')
    const atomIdent1 = seq.getAtomIdentForInsertionIndex(0, 1)
    seq.insertAtAtomIdent('foo', atomIdent1)
    const atomIdent2 = seq.getAtomIdentForInsertionIndex(0, 1)
    seq.insertAtAtomIdent('bar', atomIdent2)
    const atomIdent3 = seq.getAtomIdentForInsertionIndex(0, 1)
    seq.insertAtAtomIdent('baz', atomIdent3)
    expect(seq.toArray()).toEqual(['baz', 'bar', 'foo'])
  })

  test('inserting (using index) one element in an empty sequence', () => {
    const seq = new LogootSequenceWrapper('a')
    seq.insertAtIndex('foo', 0, 1)
    expect(seq.toArray()).toEqual(['foo'])
  })

  test('inserting (using index) multiple elements in an empty sequence', () => {
    const seq = new LogootSequenceWrapper('a')
    seq.insertAtIndex('foo', 0, 1)
    seq.insertAtIndex('bar', 0, 1)
    seq.insertAtIndex('baz', 0, 1)
    expect(seq.toArray()).toEqual(['baz', 'bar', 'foo'])
  })

})

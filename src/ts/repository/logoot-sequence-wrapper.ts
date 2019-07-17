import {atomIdent, emptySequence, insertAtom, genAtomIdent, compareAtomIdents} from '../lib/logootsequence.js'

function insertMut(sequence, index, atom) {
  sequence.splice(index, 0, atom)
  return sequence
}

/**
 * A sequence of unique items, the uniqueness invariant is important since
 * we may use it to cache locations of items in the sequence for fast insertion.
 */
export class LogootSequenceWrapper<T> {
  private sequence = emptySequence()

  constructor(readonly peerId: string) {}

  insertAtAtomIdent(item: T, pos: atomIdent): void {
    insertAtom(this.sequence, [pos, item], insertMut)
  }

  deleteAtAtomIdent(pos: atomIdent): void {
    let deletePos = -1
    for (let i = 1; i < this.sequence.length - 1; i++) {
      if (compareAtomIdents(pos, this.sequence[i][0]) === 0) {
        deletePos = i
        break
      }
    }
    if (deletePos >= 0 && deletePos < this.sequence.length) {
      this.sequence.splice(deletePos, 1)
    }
  }

  getAtomIdent(pos: number): atomIdent {
    if (pos < 0 || pos >= this.length()) {
      throw new Error(`Invalid positionn ${pos}`)
    }
    return this.sequence[pos + 1][0]
  }

  /**
   * Element will be inserted at pos and everything starting with pos will be shifted right.
   * If pos is >= sequence.length then it will be appended.
   * The position is relative to the the externalarray range for this sequence not its internal representation.
   */
  insertAtIndex(item: T, pos: number, peerClock): void {
    const atomId = this.getAtomIdentForInsertionIndex(pos, peerClock)
    this.insertAtAtomIdent(item, atomId)
  }

  getAtomIdentForInsertionIndex(pos: number, peerClock): atomIdent {
    if (pos < 0) {
      throw new Error(`Invalid positionn ${pos}`)
    }
    return pos >= this.length()
      ? genAtomIdent(
        this.peerId,
        peerClock,
        this.sequence[this.sequence.length - 2][0],
        this.sequence[this.sequence.length - 1][0])
      : genAtomIdent(
        this.peerId,
        peerClock,
        this.sequence[pos][0],
        this.sequence[pos + 1][0])
  }

  deleteAtIndex(pos: number): void {
    if (pos < 0 || pos >= this.length()) {
      throw new Error(`Trying to remove element at pos ${pos} which is out of bounds for this logootsequence`)
    }
    this.sequence.splice(pos + 1, 1)
  }

  length(): number {
    return this.sequence.length - 2
  }

  toArray(): T[] {
    // cut off the marker items at the beginning and the end
    return this.sequence.slice(1, -1).map(atom => atom[1])
  }
}

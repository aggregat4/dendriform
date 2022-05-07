import { RelativeLinearPosition, RelativeNodePosition } from '../domain/domain'
import {
  atom,
  atomIdent,
  compareAtomIdents,
  emptySequence,
  genAtomIdent,
  insertAtom,
  sequence,
} from '../lib/modules/logootsequence'

function insertMut(seq: sequence, index: number, anAtom: atom) {
  seq.splice(index, 0, anAtom)
  return seq
}

/**
 * A sequence of _unique_ items, the uniqueness invariant is important since
 * we may use it to cache locations of items in the sequence for fast insertion.
 */
export class LogootSequenceWrapper {
  private seq: sequence = emptySequence()

  insertElement(
    element: string,
    position: RelativeNodePosition,
    clock: number,
    siteId: string
  ): atomIdent {
    const insertionIndex = this.getChildInsertionIndex(position)
    const insertionAtomIdent = this.getAtomIdentForInsertionIndex(insertionIndex, clock, siteId)
    this.insertAtAtomIdent(element, insertionAtomIdent)
    return insertionAtomIdent
  }

  /**
   * @param element The element to delete. This sequence assumes that the elements are all unique.
   * @returns The position of the elemt that was deleted, null otherwise
   */
  deleteElement(element: string): atomIdent {
    const indexOfChild = this.toArray().indexOf(element)
    if (indexOfChild >= 0) {
      // ordering here is crucial: get the atom ident first, and THEN delete the item, otherwise
      // it is the wrong value
      // TODO: I don't think we need getAtomIdent for Index, we should just iterate and get the atomident directly
      // instead of this workaround with toArray and then the index
      const deletionAtomIdent = this.getAtomIdent(indexOfChild)
      this.deleteAtIndex(indexOfChild)
      return deletionAtomIdent
    } else {
      return null
    }
  }

  private getChildInsertionIndex(position: RelativeNodePosition): number {
    if (position.beforeOrAfter === RelativeLinearPosition.BEGINNING) {
      return 0
    } else if (position.beforeOrAfter === RelativeLinearPosition.AFTER) {
      // QUESTION: We default to insert at the beginning of the sequence when we can not find the after Node, is this right?
      const afterNodeIndex = this.toArray().indexOf(position.nodeId)
      if (afterNodeIndex === -1) {
        return 0
      } else {
        return afterNodeIndex + 1
      }
    } else if (position.beforeOrAfter === RelativeLinearPosition.BEFORE) {
      // QUESTION: We default to insert at the beginning of the sequence when we can not find the before Node, is this right?
      const beforeNodeIndex = this.toArray().indexOf(position.nodeId)
      if (beforeNodeIndex === -1) {
        return 0
      } else {
        return beforeNodeIndex
      }
    } else if (position.beforeOrAfter === RelativeLinearPosition.END) {
      return this.length()
    }
  }

  insertAtAtomIdent(item: string, pos: atomIdent): void {
    insertAtom(this.seq, [pos, item], insertMut)
  }

  deleteAtAtomIdent(pos: atomIdent): void {
    let deletePos = -1
    for (let i = 1; i < this.seq.length - 1; i++) {
      if (compareAtomIdents(pos, this.seq[i][0]) === 0) {
        deletePos = i
        break
      }
    }
    if (deletePos >= 0 && deletePos < this.seq.length) {
      this.seq.splice(deletePos, 1)
    }
  }

  private getAtomIdent(pos: number): atomIdent {
    if (pos < 0 || pos >= this.length()) {
      throw new Error(`Invalid positionn ${pos}`)
    }
    return this.seq[pos + 1][0]
  }

  // TODO: only public for tests, how to handle?
  getAtomIdentForInsertionIndex(pos: number, peerClock: number, siteId: string): atomIdent {
    if (pos < 0) {
      throw new Error(`Invalid positionn ${pos}`)
    }
    return pos >= this.length()
      ? genAtomIdent(
          siteId,
          peerClock,
          this.seq[this.seq.length - 2][0],
          this.seq[this.seq.length - 1][0]
        )
      : genAtomIdent(siteId, peerClock, this.seq[pos][0], this.seq[pos + 1][0])
  }

  getAtomIdentForItem(item: string): atomIdent | null {
    const index = this.toArray().indexOf(item)
    if (index === -1) {
      return null
    }
    return this.getAtomIdent(index)
  }

  private deleteAtIndex(pos: number): void {
    if (pos < 0 || pos >= this.length()) {
      throw new Error(
        `Trying to remove element at pos ${pos} which is out of bounds for this logootsequence`
      )
    }
    this.seq.splice(pos + 1, 1)
  }

  length(): number {
    return this.seq.length - 2
  }

  toArray(): string[] {
    // cut off the marker items at the beginning and the end
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.seq.slice(1, -1).map((anAtom) => anAtom[1])
  }
}

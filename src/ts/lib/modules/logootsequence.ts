/**
 * A sequence of atoms identified by atom identifiers.
 *
 * Across all replicas, a sequence is guaranteed to converge to the same value
 * given all operations have been received in causal order.
 */
// Copied and modified from https://github.com/usecanvas/logoot-js (MIT license)
const MAX_POS = 32767
const ABS_MIN_ATOM_IDENT: atomIdent = [[[0, 0]], 0]
const ABS_MAX_ATOM_IDENT: atomIdent = [[[MAX_POS, 0]], 1]

/**
 * The result of a comparison operation.
 */
export type comparisonResult = -1 | 0 | 1

/**
 * An array `[int, site]` where `int` is an integer and `site` is a site
 * identifier.
 *
 * The site identifier may be any comparable value.
 */
export type ident = [number, any]

/**
 * A list of `ident`s.
 */
export type position = ident[]

/**
 * An array `[pos, vector]` where `pos` is a position and `vector` is the value
 * of a vector clock at the site that created the associated atom.
 */
export type atomIdent = [position, number]

/**
 * An array `[atomIdent, value]` where `atomIdent` is the globally unique
 * identifier for this atom and `value` is the atom's value.
 *
 * @typedef {Array<atomIdent, *>} atom
 */
export type atom = [atomIdent, any]

/**
 * An ordered sequence of `atom`s, whose first atom will always be
 * `[ABS_MIN_ATOM_IDENT, null]` and whose last atom will always be
 * `[ABS_MAX_ATOM_IDENT, null]`.
 */
export type sequence = atom[]

export const min = ABS_MIN_ATOM_IDENT
export const max = ABS_MAX_ATOM_IDENT

/**
 * Compare two atom identifiers, returning `1` if the first is greater than the
 * second, `-1` if it is less, and `0` if they are equal.
 *
 * @param atomIdentA The atom to compare another atom against
 * @param atomIdentB The atom to compare against the first
 */
export function compareAtomIdents(atomIdentA: atomIdent, atomIdentB: atomIdent): comparisonResult {
  return comparePositions(atomIdentA[0], atomIdentB[0])
}

/**
 * Return the "empty" sequence, which is a sequence containing only the min and
 * max default atoms.
 */
export function emptySequence(): sequence {
  return [[ABS_MIN_ATOM_IDENT, null], [ABS_MAX_ATOM_IDENT, null]]
}

/**
 * Generate an atom ID between the two given atom IDs for the given site ID.
 *
 * @param siteID The ID of the site at which the atom originates
 * @param clock The value of the site's vector clock
 * @param prevAtomIdent The atom identify before the new one
 * @param nextAtomIdent The atom identify after the new one
 */
export function genAtomIdent(siteID: any, clock: number, prevAtomIdent: atomIdent, nextAtomIdent: atomIdent): atomIdent {
  return [genPosition(siteID, prevAtomIdent[0], nextAtomIdent[0]), clock]
}

/**
 * Insert an atom into a sequence using the given function.
 *
 * The function will receive the sequence, an index to insert at, and the atom
 * as arguments.
 *
 * If the atom is already in the sequence, the **original sequence object** will
 * be returned.
 *
 * @param seq The sequence to insert the atom into
 * @param anAtom The atom to insert into the sequence
 * @param {function(sequence, number, atom) : sequence} insertFunc The function
 *   that will be called on to do the insert
 */
export function insertAtom(seq: sequence, anAtom: atom, insertFunc: (s: sequence, n: number, a: atom) => sequence): sequence {
  const sequenceLength = seq.length

  for (let i = 0; i < sequenceLength; i++) {
    const prev = seq[i]
    const next = seq[i + 1]

    const aPosition = anAtom[0][0]
    const prevPosition = prev[0][0]
    const nextPosition = next[0][0]

    const comparisons =
      [comparePositions(aPosition, prevPosition),
       comparePositions(aPosition, nextPosition)]

    if (comparisons[0] === 1 && comparisons[1] === -1) {
      return insertFunc(seq, i + 1, anAtom)
    } else if (comparisons[0] === 1 && comparisons[1] === 1) {
      continue
    } else if (comparisons[0] === -1 && comparisons[1] === 1 ||
               comparisons[0] === -1 && comparisons[1] === -1) {
      throw new Error('Sequence out of order!')
    } else {
      return seq
    }
  }
}

/**
 * Compare two positions, returning `1` if the first is greater than the second,
 * `-1` if it is less, and `0` if they are equal.
 *
 * @param posA The position to compare another position against
 * @param posB The position to compare against the first
 */
function comparePositions(posA: position, posB: position): comparisonResult {
  if (posA.length === 0 && posB.length === 0) return 0
  if (posA.length === 0) return -1
  if (posB.length === 0) return 1

  switch (compareIdents(posA[0], posB[0])) {
    case 1:
      return 1
    case -1:
      return -1
    case 0:
      return comparePositions(posA.slice(1), posB.slice(1))
  }
}

/**
 * Compare two idents, returning `1` if the first is greater than the second,
 * `-1` if it is less, and `0` if they are equal.
 *
 * @param identA The ident to compare another ident against
 * @param identB The ident to compare against the first
 */
function compareIdents([identAInt, identASite]: ident, [identBInt, identBSite]: ident): comparisonResult {
  if (identAInt > identBInt) return 1
  if (identAInt < identBInt) return -1
  if (identASite > identBSite) return 1
  if (identASite < identBSite) return -1
  return 0
}

/**
 * Generate a position for a site ID between two other positions.
 *
 * @param siteID The ID of the site at which the position originates
 * @param prevPos The position before the new one
 * @param nextPos The position after the new one
 */
function genPosition(siteID: any, prevPos: position, nextPos: position): position {
  prevPos = prevPos.length > 0 ? prevPos : min[0]
  nextPos = nextPos.length > 0 ? nextPos : max[0]

  const prevHead = prevPos[0]
  const nextHead = nextPos[0]

  const [prevInt, prevSiteID] = prevHead
  const [nextInt, _nextSiteID] = nextHead

  switch (compareIdents(prevHead, nextHead)) {
    case -1: {
      const diff = nextInt - prevInt

      if (diff > 1) {
        return [[randomIntBetween(prevInt, nextInt), siteID]]
      } else if (diff === 1 && siteID > prevSiteID) {
        return [[prevInt, siteID]]
      } else {
        return [prevHead].concat(
          genPosition(siteID, prevPos.slice(1), nextPos.slice(1)))
      }
    } case 0: {
      return [prevHead].concat(
              genPosition(siteID, prevPos.slice(1), nextPos.slice(1)))
    } case 1: {
      throw new Error('"Next" position was less than "previous" position.')
    }
  }
}

/**
 * Return a random number between two others.
 *
 * @param randomMin The floor (random will be greater-than)
 * @param randomMax The ceiling (ranodm will be less-than)
 */
function randomIntBetween(randomMin: number, randomMax: number): number {
  return Math.floor(Math.random() * (randomMax - (randomMin + 1))) + randomMin + 1
}

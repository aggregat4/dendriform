import { DEventPayload } from './eventlog-domain'

export interface PeerMetadata {
  eventlogid: string
  clock: number
}

/**
 * "Database Schema" for events stored in the 'eventlog' table in the indexeddb.
 */
export interface StoredEvent {
  eventid: number
  localId: number
  treenodeid: string
  parentnodeid: string
  peerid: number // these are remapped peerids, from the external string to a number
  clock: number
  payload: DEventPayload
}

/**
 * Events are totally ordered by comparing their lamport clocks and in case of equal
 * lamport clocks by comparing their peerid.
 *
 * @returns < 0 when a is smaller than b, > 0 when a is larger than b and 0 if they
 *          are the same
 */
export function storedEventComparator(a: StoredEvent, b: StoredEvent): number {
  const comp = a.clock - b.clock
  if (comp === 0) {
    return a.peerid < b.peerid ? -1 : a.peerid > b.peerid ? 1 : 0
  } else {
    return comp
  }
}

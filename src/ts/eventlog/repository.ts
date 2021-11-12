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
  nodeid: string
  parentnodeid: string
  peerid: number // these are remapped peerids, from the external string to a number
  clock: number
  payload: DEventPayload
}

/**
 * Metadata about the state of the local replica.
 */
export interface Replica {
  replicaId: string
  clock: number
}

/**
 * A representation of all the log moves that we need to persist to allow
 * for processing new incoming events. This table will be garbage collected
 * once we can identify at what clock we are causally stable.
 */
export interface LogMoveRecord {
  clock: number
  replicaId: string
  oldParentId: string
  oldPayload: DEventPayload
  newParentId: string
  newParentPayload: DEventPayload
  childId: string
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

import { VectorClock, VectorClockValuesType } from '../lib/vectorclock'
import { DEventPayload } from './eventlog-domain'

export interface PeerMetadata {
  eventlogid: string
  vectorclock: VectorClockValuesType
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
  vectorclock: VectorClockValuesType
  payload: DEventPayload
}

/**
 * Comparing two events basically means comparing their vector clocks and we delegate
 * to the VectorClock class for that. If the two vector clocks are concurrent we further
 * sort by peerid, thus enforcing s stable total ordering.
 *
 * @returns < 0 when a is smaller than b, > 0 when a is larger than b and 0 if they
 *          are the same
 */
export function storedEventComparator(a: StoredEvent, b: StoredEvent): number {
  const vcComp = VectorClock.compareValues(a.vectorclock, b.vectorclock)
  if (vcComp === 0) {
    return a.peerid < b.peerid ? -1 : a.peerid > b.peerid ? 1 : 0
  } else {
    return vcComp
  }
}

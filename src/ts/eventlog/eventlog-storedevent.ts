import {VectorClock, NumberVectorClockValues} from '../lib/vectorclock'
import { EventPayloadType } from './eventlog'

/**
 * "Database Schema" for events stored in the 'eventlog' table in the indexeddb.
 */
export interface StoredEvent {
  eventid: number,
  eventtype: number,
  treenodeid: string,
  peerid: string,
  vectorclock: NumberVectorClockValues,
  payload: EventPayloadType,
}

export function storedEventComparator(a: StoredEvent, b: StoredEvent): number {
  const vcComp = VectorClock.compareValues(a.vectorclock, b.vectorclock)
  if (vcComp === 0) {
    return a.peerid < b.peerid ? -1 : (a.peerid > b.peerid ? 1 : 0)
  } else {
    return vcComp
  }
}

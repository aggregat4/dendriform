import { DEvent } from './eventlog-domain'
import { LocalEventLogIdMapper } from './idb-peerid-repository'
import { StoredEvent } from './repository'

export function mapStoredEventToDEvent(
  peerIdMapper: LocalEventLogIdMapper,
  ev: StoredEvent
): DEvent {
  return new DEvent(
    peerIdMapper.internalToExternalPeerId(Number(ev.peerid)),
    ev.clock,
    ev.nodeid,
    ev.parentnodeid,
    ev.payload
  )
}

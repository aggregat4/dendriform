import { DEvent } from './eventlog-domain'
import { LocalEventLogIdMapper } from './idb-peerid-repository'
import { StoredEvent } from './repository'

export function mapStoredEventToDEvent(
  peerIdMapper: LocalEventLogIdMapper,
  ev: StoredEvent
): DEvent {
  return new DEvent(
    ev.localId,
    peerIdMapper.internalToExternalPeerId(Number(ev.peerid)),
    ev.clock,
    ev.treenodeid,
    ev.parentnodeid,
    ev.payload
  )
}

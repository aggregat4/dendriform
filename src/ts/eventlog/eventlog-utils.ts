import { DEvent } from './eventlog-domain'
import { LocalEventLogIdMapper } from './idb-peerid-mapper'
import { StoredEvent } from './eventlog-storedevent'

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

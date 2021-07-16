import { VectorClock, VectorClockValuesType } from '../lib/vectorclock'
import { DEvent } from './eventlog'
import { LocalEventLogIdMapper } from './eventlog-indexeddb-peerid-mapper'
import { StoredEvent } from './eventlog-storedevent'

/**
 * @returns A vectorclock where all node ids have been mapped from external UUIDs to
 * internal number ids. This never throws since an unknown nodeId is just added to the map.
 */
export async function externalToInternalVectorclockValues(
  mapper: LocalEventLogIdMapper,
  externalClockValues: VectorClockValuesType
): Promise<VectorClockValuesType> {
  const internalValues = {}
  for (const externalNodeId of Object.keys(externalClockValues)) {
    internalValues[await mapper.externalToInternalPeerId(externalNodeId)] =
      externalClockValues[externalNodeId]
  }
  return internalValues
}

/**
 * @returns A vectorclock where all node ids have been mapped from internal numbers to
 * external UUIDs. This function throws when the internal id is unknown.
 */
export function internalToExternalVectorclockValues(
  mapper: LocalEventLogIdMapper,
  internalClockValues: VectorClockValuesType
): VectorClockValuesType {
  const externalValues = {}
  for (const internalNodeId of Object.keys(internalClockValues)) {
    externalValues[mapper.internalToExternalPeerId(Number(internalNodeId))] =
      internalClockValues[internalNodeId]
  }
  return externalValues
}

export function mapStoredEventToDEvent(
  peerIdMapper: LocalEventLogIdMapper,
  ev: StoredEvent
): DEvent {
  return new DEvent(
    ev.localId,
    ev.eventtype,
    peerIdMapper.internalToExternalPeerId(Number(ev.peerid)),
    new VectorClock(internalToExternalVectorclockValues(peerIdMapper, ev.vectorclock)),
    ev.treenodeid,
    ev.payload
  )
}

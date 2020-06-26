import { DEvent, EventPayloadType } from '../eventlog/eventlog'
import { VectorClock, VectorClockValuesType } from '../lib/vectorclock'

export type ServerEventClock = VectorClockValuesType

export type ServerEventPayload = EventPayloadType

export type ServerEvent = {
  localId: number,
  type: number,
  originator: string,
  clock: ServerEventClock,
  nodeId: string,
  payload: ServerEventPayload
}

export type ServerEventWrapper = {
  originator: string,
  body: string
}

export type ServerEvents = {
  counter: number,
  events: ServerEventWrapper[]
}

/**
 * Server format for an event to publish:
 * {
 *    originator: string,
 *    body: string,
 * }
 * @param event The event to serialize.
 */
export function serializeServerEvent(event: DEvent): ServerEventWrapper {
  return {
    originator: event.originator,
    body: JSON.stringify(event),
  }
}

/**
 * TODO: versioning!?
 * @param events in the format provided by the dendriform server
 */
export function deserializeServerEvents(events: ServerEventWrapper[]): DEvent[] {
  return events.map((se) => {
    return deserializeServerEvent(JSON.parse(se.body))
  })
}

/**
 * Mapping of server events is dependent on the generic type of this
 * remote event log since that determine the payload of the concrete event.
 */
function deserializeServerEvent(serverEvent: ServerEvent): DEvent {
  return new DEvent(
    serverEvent.localId,
    serverEvent.type,
    serverEvent.originator,
    new VectorClock(serverEvent.clock),
    serverEvent.nodeId,
    serverEvent.payload
  )
}

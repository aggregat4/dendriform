import { DEvent, AddOrUpdateNodeEventPayload, ReparentNodeEventPayload, ReorderChildNodeEventPayload, EventPayloadType, EventType } from '../eventlog/eventlog'
import { VectorClock, StringVectorClockValues } from '../lib/vectorclock'

function deserializeEventPayload(event: any): EventPayloadType {
  if (event.type === EventType.ADD_OR_UPDATE_NODE) {
    return deserializeAddOrUpdateNodeEventPayload(event.payload)
  } else if (event.type === EventType.REPARENT_NODE) {
    return deserializeReparentNodeEventPayload(event.payload)
  } else if (event.type === EventType.REORDER_CHILD) {
    return deserializeReorderChildNodeEventPayload(event.payload)
  }
}

function deserializeAddOrUpdateNodeEventPayload(payload: any): AddOrUpdateNodeEventPayload {
  return {
    name: payload.name,
    note: payload.note,
    flags: payload.flags,
    created: payload.created,
    updated: payload.updated,
  }
}

function deserializeReparentNodeEventPayload(payload: any): ReparentNodeEventPayload {
  return {
    parentId: payload.parentId,
  }
}

function deserializeReorderChildNodeEventPayload(payload: any): ReorderChildNodeEventPayload {
  return {
    operation: payload.operation,
    position: payload.position,
    childId: payload.childId,
    parentId: payload.parentId,
  }
}

/**
 * Server format for an event to publish:
 * {
 *    originator: string,
 *    body: string,
 * }
 * @param event The event to serialize.
 */
export function serializeServerEvent(event: DEvent): any {
  return {
    originator: event.originator,
    body: JSON.stringify(event),
  }
}

/**
 * Server format:
 * {
 *  counter: number,
 *  events: [
 *    {
 *      originator: string,
 *      body: string (json),
 *    }
 *  ]
 * }
 * TODO: versioning!?
 * @param events in the format provided by the dendriform server
 */
export function deserializeServerEvents(events: any[]): DEvent[] {
  return events.map((se) => {
    return deserializeServerEvent(JSON.parse(se.body))
  })
}

/**
 * Mapping of server events is dependent on the generic type of this
 * remote event log since that determine the payload of the concrete event.
 */
function deserializeServerEvent(serverEvent: any): DEvent {
  return new DEvent(
    serverEvent.localId,
    serverEvent.type,
    serverEvent.originator,
    deserializeVectorClock(serverEvent.clock),
    serverEvent.nodeId,
    deserializeEventPayload(serverEvent))
}

/**
 * @param clock A serialized vector clock from the server, we assume it has
 * a property 'values' that contains the body of a vector clock as defined by
 * our implementation.
 * @throws An Error when the object from the server does not contain a 'values'
 * property.
 */
function deserializeVectorClock(clock: any): VectorClock<StringVectorClockValues> {
  if ('values' in clock) {
    return new VectorClock(clock.values)
  } else {
    throw new Error('Invalid vectorclock in server side event: ' + clock)
  }
}

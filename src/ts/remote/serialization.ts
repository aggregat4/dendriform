import { DEvent, AddOrUpdateNodeEventPayload, ReparentNodeEventPayload, ReorderChildNodeEventPayload } from '../eventlog/eventlog'
import { VectorClock } from '../lib/vectorclock'
import {atomIdent} from '../lib/logootsequence.js'

export function addOrUpdateNodeEventPayloadDeserializer(payload: any): AddOrUpdateNodeEventPayload {
  return {
    name: payload.name,
    note: payload.note,
    deleted: !!payload.deleted,
    collapsed: !!payload.collapsed,
  }
}

export function rparentNodeEventPayloadDeserializer(payload: any): ReparentNodeEventPayload {
  return {
    parentId: payload.parentId,
  }
}

export function reorderChildNodeEventPayloadDeserializer(payload: any): ReorderChildNodeEventPayload {
  return {
    operation: payload.operation,
    position: deserializeAtomIdent(payload.position),
    childId: payload.childId,
    parentId: payload.parentId,
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
export function deserializeServerEvents<T>(events: any[], payloadDeserializer: (any) => T): Array<DEvent<T>> {
  return events.map((se) => {
    return deserializeServerEvent(JSON.parse(se.body), payloadDeserializer)
  })
}

/**
 * Mapping of server events is dependent on the generic type of this
 * remote event log since that determine the payload of the concrete event.
 */
export function deserializeServerEvent<T>(serverEvent: any, payloadDeserializer: (any) => T): DEvent<T> {
  return new DEvent<T>(
    serverEvent.type,
    serverEvent.originator,
    deserializeVectorClock(serverEvent.clock),
    serverEvent.nodeId,
    payloadDeserializer(serverEvent.payload))
}

/**
 * @param clock A serialized vector clock from the server, we assume it has
 * a property 'values' that contains the body of a vector clock as defined by
 * our implementation.
 * @throws An Error when the object from the server does not contain a 'values'
 * property.
 */
export function deserializeVectorClock(clock: any): VectorClock {
  if ('values' in clock) {
    return new VectorClock(clock.values)
  } else {
    throw new Error('Invalid vectorclock in server side event: ' + clock)
  }
}

export function deserializeAtomIdent(value: any): atomIdent {
  // TODO: implement
}

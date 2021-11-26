import { DEvent, NodeMetadata } from '../eventlog/eventlog-domain'

type ServerEvent = {
  type: number
  originator: string
  clock: number
  nodeId: string
  parentId: string
  payload: NodeMetadata
}

type ServerEventWrapper = {
  originator: string
  body: string
}

export type ServerEvents = {
  counter: number
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
    serverEvent.originator,
    serverEvent.clock,
    serverEvent.nodeId,
    serverEvent.parentId,
    serverEvent.payload
  )
}

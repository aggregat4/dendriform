import {VectorClock} from '../lib/vectorclock'
import {Predicate} from '../util'
import {atomIdent} from '../lib/logootsequence.js'

export enum EventType {
  ADD_OR_UPDATE_NODE,
  REPARENT_NODE,
  REORDER_CHILD,
}

export const ALL_EVENT_TYPES = [EventType.ADD_OR_UPDATE_NODE, EventType.REORDER_CHILD, EventType.REPARENT_NODE]

export interface AddOrUpdateNodeEventPayload {
  name: string,
  note: string,
  deleted: boolean,
  collapsed: boolean,
}

export interface ReparentNodeEventPayload {
  parentId: string,
}

export enum LogootReorderOperation {
  INSERT,
  DELETE,
}

export interface ReorderChildNodeEventPayload {
  operation: LogootReorderOperation,
  position: atomIdent, // this is a logoot position/sequence identifier, a bunch of nested arrays
  childId: string,
  parentId: string,
}

export type EventPayloadType = AddOrUpdateNodeEventPayload | ReparentNodeEventPayload | ReorderChildNodeEventPayload

export class DEvent {
  constructor(
    readonly type: EventType,
    readonly originator: string,
    readonly clock: VectorClock,
    readonly nodeId: string,
    readonly payload: EventPayloadType) {}

  isIdentical(other: DEvent): boolean {
    return this.type === other.type && this.clock.isIdentical(other.clock)
  }
}

export class EventLogError extends Error {}
export class CounterTooHighError extends EventLogError {}

export type EventListener = (_: DEvent) => void

export interface EventSubscriber {
  notify(events: DEvent[]): void
  filter: Predicate<DEvent>
}

export type EventLogCounter = number

export interface Events {
  counter: EventLogCounter,
  events: DEvent[],
}

export interface DEventSource {
  publish(type: EventType, nodeId: string, payload: EventPayloadType): Promise<any>
}

export type EventGcInclusionFilter = (newEventPayload: EventPayloadType, oldEventPayload: EventPayloadType) => boolean

export interface DEventLog extends DEventSource {
  // A globally unique ID identifying this peer in a multi-peer environment
  getPeerId(): string,
  // The logical name of the eventlog, for example 'dendriform-tree-structure-events'
  getName(): string,
  getCounter(): number,
  insert(events: DEvent[]): Promise<EventLogCounter>
  // TODO: consider returning a subscription that can be cancelled
  subscribe(subscriber: EventSubscriber): void
  /**
   * Loads all events that a counter that is higher than the provided number.
   * @return An array that is causally sorted by vectorclock and peerid.
   * @throws CounterTooHighError when the provided counter is higher than the max counter
   * of the eventlog.
   */
  getEventsSince(eventTypes: EventType[], counter: number, peerId?: string): Promise<Events>
  getEventsForNode(eventTypes: EventType[], nodeId: string): Promise<DEvent[]>
}

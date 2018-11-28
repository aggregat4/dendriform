import {VectorClock} from '../lib/vectorclock'
import {Predicate} from '../util'
import {atomIdent} from '../lib/logootsequence.js'

export enum EventType {
  ADD_OR_UPDATE_NODE,
  REPARENT_NODE,
  REORDER_CHILD,
}

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

export class DEvent<T> {
  constructor(
    readonly type: EventType,
    readonly originator: string,
    readonly clock: VectorClock,
    readonly nodeId: string,
    readonly payload: T) {}

  isIdentical(other: DEvent<T>): boolean {
    return this.type === other.type && this.clock.isIdentical(other.clock)
  }
}

export class EventLogError extends Error {}
export class CounterTooHighError extends EventLogError {}

export type EventListener<T> = (_: DEvent<T>) => void

export interface EventSubscriber<T> {
  notify(events: Array<DEvent<T>>): void
  filter: Predicate<DEvent<T>>
}

export type EventLogCounter = number

export interface Events<T> {
  counter: EventLogCounter,
  events: Array<DEvent<T>>,
}

export interface DEventSource<T> {
  publish(type: EventType, nodeId: string, payload: T): Promise<any>
}

export type EventGcInclusionFilter<T> = (newEventPayload: T, oldEventPayload: T) => boolean

// For the child order event log we need a special garbage collection filter because
// with logoot events for a sequence we don't just want to retain the newest event for each
// parent, rather we need to retain the newest event for a particular child for that parent and
// additionally take into account the operation type. We need to retain the newest DELETE as well
// as INSERT operation so we can reliably rebuild the sequence
export const LOGOOT_EVENT_GC_FILTER: EventGcInclusionFilter<ReorderChildNodeEventPayload> =
  (newEventPayload: ReorderChildNodeEventPayload, oldEventPayload: ReorderChildNodeEventPayload) => {
    return newEventPayload.childId === oldEventPayload.childId
      && newEventPayload.operation === oldEventPayload.operation
  }

export interface DEventLog<T> extends DEventSource<T> {
  // A globally unique ID identifying this peer in a multi-peer environment
  getPeerId(): string,
  // The logical name of the eventlog, for example 'dendriform-tree-structure-events'
  getName(): string,
  getCounter(): number,
  insert(events: Array<DEvent<T>>): Promise<EventLogCounter>
  // TODO: consider returning a subscription that can be cancelled
  subscribe(subscriber: EventSubscriber<T>): void
  /**
   * Loads all events that a counter that is higher than the provided number.
   * @return An array that is causally sorted by vectorclock and peerid.
   * @throws CounterTooHighError when the provided counter is higher than the max counter
   * of the eventlog.
   */
  getEventsSince(counter: number, peerId?: string): Promise<Events<T>>
  getEventsForNode(nodeId: string): Promise<Array<DEvent<T>>>
}

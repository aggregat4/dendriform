import { RepositoryNode, LoadedTree } from '../domain/domain'
import { VectorClock } from '../lib/vectorclock'

// At the moment we put add and update together and always transport
// the full payload. This makes everything easier for now.
export enum EventType {
  ADD_OR_UPDATE_NODE,
  REPARENT_NODE,
}

export interface AddOrUpdateNodeEventPayload {
  name: string,
  note: string,
  deleted: boolean,
  collapsed: boolean,
}

export interface ReparentNodeEventPayload {
  parentId: string,
  afterNodeId: string, // whether to position the node, can be one of the NODELIST_MARKERS
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

export type Predicate = (_: any) => boolean

export class EventLogError extends Error {}
export class CounterTooHighError extends EventLogError {}

export type EventListener<T> = (_: DEvent<T>) => void

export interface EventSubscriber<T> {
  notify: EventListener<T>,
  filter: Predicate,
}
export type EventLogCounter = number

export interface EventLogState {
  counter: number
}

export interface Events<T> extends EventLogState {
  events: Array<DEvent<T>>,
}

export interface DEventSource<T> {
  publish(type: EventType, nodeId: string, payload: T): Promise<any>
}

export interface DEventLog<T> {
  insert(events: DEvent<T>): Promise<EventLogCounter>
  // TODO: consider returning a subscription that can be cancelled
  subscribe(subscriber: EventSubscriber<T>): void
  // throws CounterTooHighError when counter is larger than what the server knows
  getEventsSince(counter: number): Promise<Events<T>>
}

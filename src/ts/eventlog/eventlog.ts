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

export class DEvent {
  constructor(
    readonly type: EventType,
    readonly originator: string,
    readonly clock: VectorClock,
    readonly nodeId: string,
    readonly payload: AddOrUpdateNodeEventPayload | ReparentNodeEventPayload) {}

    isIdentical(other: DEvent): boolean {
      return this.type === other.type && this.clock.isIdentical(other.clock)
    }

}

export type Predicate = (_: any) => boolean

export class EventLogError extends Error {}
export class CounterTooHighError extends EventLogError {}

export type EventListener = (_: DEvent) => void
export interface EventSubscriber {
  notify: EventListener,
  filter: Predicate,
}
export type EventLogCounter = number

export interface EventLogState {
  counter: number
}

export interface Events extends EventLogState {
  events: DEvent[],
}

export interface DEventSource {
  publish(type: EventType, nodeId: string,
          payload: AddOrUpdateNodeEventPayload | ReparentNodeEventPayload): Promise<any>
}

export interface DEventLog {
  insert(events: DEvent): Promise<EventLogCounter>
  // TODO: consider returning a subscription that can be cancelled
  subscribe(subscriber: EventSubscriber): void
  // throws CounterTooHighError when counter is larger than what the server knows
  getEventsSince(counter: number): Promise<Events>
}

// ----- Tree specific query functionality ----

export interface TreeQueryable {
  getChildIds(nodeId: string): Promise<string[]>
  getParentId(nodeId: string): Promise<string>
  loadNode(nodeId: string, nodeFilter: Predicate): Promise<RepositoryNode>
  loadTree(nodeId: string, nodeFilter: Predicate): Promise<LoadedTree>
}

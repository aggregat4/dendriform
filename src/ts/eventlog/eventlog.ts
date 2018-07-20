import { RepositoryNode, LoadedTree } from '../domain/domain'
import { VectorClock } from '../lib/vectorclock'

export enum EventType {
  ADD_NODE,
  UPDATE_NODE,
  REPARENT_NODE,
}

export interface AddNodeEventPayload {
  id: string,
  name: string,
  note: string,
}

// null indicates clearing content, undefined is just a non updated field
export interface UpdateNodeEventPayload {
  id: string,
  name?: string,
  note?: string,
  deleted?: boolean,
  collapsed?: boolean,
}

export interface ReparentNodeEventPayload {
  childId: string,
  parentId: string,
  afterNodeId: string, // whether to position the node, can be one of the NODELIST_MARKERS
}

export class DEvent {
  constructor(
    readonly type: EventType,
    readonly originator: string,
    readonly clock: VectorClock,
    readonly payload: AddNodeEventPayload | UpdateNodeEventPayload | ReparentNodeEventPayload) {}

    isIdentical(other: DEvent): boolean {
      return this.type === other.type && this.clock.isIdentical(other.clock)
    }

}

export class EventLogError extends Error {}
export class CounterTooHighError extends EventLogError {}

export type EventSubscriber = (_: DEvent[]) => void
export type EventLogCounter = number

export interface EventLogState {
  counter: number
}

export interface Events extends EventLogState {
  events: DEvent[],
}

export type Predicate = (_: any) => boolean

export interface EventLog {
  // a unique ID for this eventlog, typically a UUID
  getId(): string
  publish(events: DEvent[]): Promise<EventLogCounter>
  subscribe(listener: EventSubscriber, eventFilter: Predicate): void
  // throws CounterTooHighError when counter is larger than what the server knows
  getEventsSince(counter: number): Promise<Events>
}

export interface QueryableEventLog extends EventLog {
  getChildIds(nodeId: string): Promise<string[]>
  getParentId(nodeId: string): Promise<string>
  loadNode(nodeId: string, nodeFilter: Predicate): Promise<RepositoryNode>
  loadTree(nodeId: string, nodeFilter: Predicate): Promise<LoadedTree>
}

import { RepositoryNode, LoadedTree } from '../domain/domain'

// interface VectorClock {
//   inc(peer: string, count: number): void
//   compareTo(other: VectorClock): number // -1, 0, 1
// }

// ---------- Events -----------------------------------------------------------
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
// TODO: should this maybe be a class directly?
// TODO: implement isIdentical() check that does the vc + eventtype check?
export interface Event {
  type: EventType,
  originator: string,
  clock: any, // TODO: really, will this be our type? maybe port that vc implementation to use actual types
  payload: AddNodeEventPayload | UpdateNodeEventPayload | ReparentNodeEventPayload,
}

// ---------- EventLog -----------------------------------------------------------
export class EventLogError extends Error {}
export class CounterTooHighError extends EventLogError {}

export type EventSubscriber = (_: Event[]) => void
export type EventLogCounter = number

export interface EventLogState {
  counter: number
}

export interface Events extends EventLogState {
  events: Event[],
}

export type Predicate = (_: any) => boolean

export interface EventLog {
  // a unique ID for this eventlog, typically a UUID
  getId(): string
  // TODO: how can we identify duplicate events? Vector Clocks identical + eventtype same?
  publish(events: Event[]): Promise<EventLogCounter>
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

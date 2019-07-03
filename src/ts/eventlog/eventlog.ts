import { VectorClock } from '../lib/vectorclock'
import { Predicate } from '../util'
import { atomIdent } from '../lib/logootsequence.js'
import { DateTime } from 'luxon'

export const enum EventType {
  ADD_OR_UPDATE_NODE,
  REPARENT_NODE,
  REORDER_CHILD,
}

export const ALL_EVENT_TYPES = [EventType.ADD_OR_UPDATE_NODE, EventType.REORDER_CHILD, EventType.REPARENT_NODE]

export const enum NodeFlags {
  deleted = 1,
  collapsed = 2,
  completed = 4,
}

// TODO: this interface is highly linked to RepositoryNode in domain.ts, should we reuse that? Keep separate is better? Anti-Corruption layer?
/**
 * This represents a node creation or update event, some fields have formats that are optimised
 * for storage and not for querying.
 * 
 * The flags field is a bitmask that can be read using the NodeFlags enum.
 * 
 * The created and updated timestamps are stored as the number of seconds since the epoch
 * because we don't need more than that accuracy and we save space.
 */
export interface AddOrUpdateNodeEventPayload {
  name: string,
  note: string,
  flags: number, // bitmask as per NodeFlags
  created: number, // epoch seconds
  updated: number, // epoch seconds
}

export function createNewAddOrUpdateNodeEventPayload(name: string, note: string, deleted: boolean, collapsed: boolean, completed: boolean, created?: string): AddOrUpdateNodeEventPayload {
  return {
    name,
    note,
    flags: (deleted ? NodeFlags.deleted : 0) | (collapsed ? NodeFlags.collapsed : 0) | (completed ? NodeFlags.completed : 0),
    created: Math.trunc(created ? DateTime.fromISO(created).toSeconds() : DateTime.local().toSeconds()),
    updated: Math.trunc(DateTime.local().toSeconds()),
  }
}

export interface ReparentNodeEventPayload {
  parentId: string,
}

export const enum LogootReorderOperation {
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
  publish(type: EventType, nodeId: string, payload: EventPayloadType, synchronous: boolean): Promise<any>
}

export interface DEventLog extends DEventSource {
  // A globally unique ID identifying this peer in a multi-peer environment
  getPeerId(): string,
  // The logical name of the eventlog, for example 'dendriform-tree-structure-events'
  getName(): string,
  getCounter(): number,
  insert(events: DEvent[], synchronous: boolean): Promise<EventLogCounter>
  // TODO: consider returning a subscription that can be cancelled
  subscribe(subscriber: EventSubscriber): void
  /**
   * Loads all events that a counter that is higher than the provided number.
   * @return An array that is causally sorted by vectorclock and peerid.
   * @throws CounterTooHighError when the provided counter is higher than the max counter
   * of the eventlog.
   */
  getEventsSince(eventTypes: EventType[], counter: number, peerId?: string): Promise<Events>
  /**
   * Gets the current, latest (after GC) structural event for a node, with type
   * EventType.ADD_OR_UPDATE_NODE.
   */
  getNodeEvent(nodeId: string): Promise<DEvent>
}

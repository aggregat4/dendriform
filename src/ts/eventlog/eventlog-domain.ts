import { Predicate } from '../utils/util'
import { atomIdent } from '../lib/modules/logootsequence.js'
import { secondsSinceEpoch } from '../utils/dateandtime'
import { Subscription } from '../domain/lifecycle'

export const enum NodeFlags {
  deleted = 1,
  collapsed = 2,
  completed = 4,
}

/**
 * This represents a node event, some fields have formats that are optimised
 * for storage and not for querying.
 *
 * The flags field is a bitmask that can be read using the NodeFlags enum.
 *
 * The created and updated timestamps are stored as the number of seconds since the epoch
 * because we don't need more than that accuracy and we save space.
 */
export interface NodeMetadata {
  name: string
  note: string
  /**
   * Bitmask as per NodeFlags.
   */
  flags: number
  /**
   * Creation timestamp in epoch seconds.
   */
  created: number // epoch seconds
  /**
   * Last updated timestamp in epoch seconds.
   */
  updated: number
  /**
   * A logoot sequence position.
   */
  logootPos: atomIdent
}

export function createNewDEventPayload(
  name: string,
  note: string,
  deleted: boolean,
  collapsed: boolean,
  completed: boolean,
  logootPos: atomIdent,
  created?: number
): NodeMetadata {
  return {
    name,
    note,
    // tslint:disable-next-line:no-bitwise
    flags:
      (deleted ? NodeFlags.deleted : 0) |
      (collapsed ? NodeFlags.collapsed : 0) |
      (completed ? NodeFlags.completed : 0),
    created: created || secondsSinceEpoch(),
    updated: secondsSinceEpoch(),
    logootPos: logootPos,
  }
}

export class DEvent {
  constructor(
    readonly originator: string,
    public clock: number,
    readonly nodeId: string,
    readonly parentId: string,
    readonly payload: NodeMetadata
  ) {}
}

export class CounterTooHighError extends Error {}

export interface EventSubscriber {
  notify(events: DEvent[]): void
  filter: Predicate<DEvent>
}

type EventLogCounter = number

export interface Events {
  counter: EventLogCounter
  events: DEvent[]
}

export interface DEventLog {
  /**
   * This adds a local event where the originator and clock of the event is set
   * by the system.
   */
  addLocalEvent(
    nodeId: string,
    parentId: string,
    payload: NodeMetadata,
    synchronous: boolean
  ): Promise<void>
  /**
   * This adds a remote event from another replica to the event log.
   * This is potentially asynchronous.
   */
  addRemoteEvent(events: DEvent[]): Promise<void>
  /**
   *  A globally unique ID identifying this peer in a multi-peer environment
   */
  getPeerId(): string
  /**
   * The logical name of the eventlog, for example 'dendriform-tree-structure-events'
   */
  getName(): string
  getCounter(): number
  subscribe(subscriber: EventSubscriber): Subscription
  /**
   * Loads all local events with a counter/eventid that is _higher_ than the provided number.
   * @return An array that contains the raw events, not causally sorted and deduplicated.
   * @throws CounterTooHighError when the provided counter is higher than the max counter
   * of the eventlog.
   */
  getRawLocalEventsSince(fromCounterNotInclusive: number, batchSize: number): Promise<Events>
  /**
   * Loads all events
   * @return An array that is causally sorted by clock and peerid.
   */
  getAllEvents(): Promise<Events>

  /**
   * TODO: maybe don't need that anymore.
   *
   * Gets the current, latest (after GC) structural event for a node, with type
   * EventType.ADD_OR_UPDATE_NODE.
   */
  getNodeEvent(nodeId: string): Promise<DEvent>
}

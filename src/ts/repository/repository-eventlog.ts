/**
 * This is a repository implementation that uses an event log, vector clocks and a shared eventlog server
 * to provide an eventually consistent, multi-peer, storage backend.
 */
import {Repository} from './repository'

const BEGINNING_NODELIST_MARKER = '|-'
const END_NODELIST_MARKER = '-|'

// TODO: use code from https://github.com/mixu/vectorclock/blob/master/index.js since I need the sorting anyway
interface VectorClock {
  inc(peer: string, count: number): void
  compareTo(other: VectorClock): number // -1, 0, 1
}

enum EventType {
  ADD_NODE,
  UPDATE_NODE,
  REPARENT_NODE,
}

interface AddNodeEventPayload {
  id: string,
  name: string,
  note: string,
}

// null indicates clearing content, undefined is just a non updated field
interface UpdateNodeEventPayload {
  id: string,
  name?: string,
  note?: string,
  deleted?: boolean,
  collapsed?: boolean,
}

interface ReparentNodeEventPayload {
  childId: string,
  parentId: string,
  afterNodeId: string, // whether to position the node, can be one of the NODELIST_MARKERS
}

interface Event {
  peer: string,
  type: EventType,
  vc: VectorClock,
  payload: AddNodeEventPayload | UpdateNodeEventPayload | ReparentNodeEventPayload,
}

// listener should return true when event should be removed from queue
type EventSubscriber = (_: Event[]) => boolean

interface EventPubSub {
  publish(events: Event[]): void
  subscribe(listener: EventSubscriber): void
}

class SyncServerError extends Error {}
class CounterTooHighError extends SyncServerError {}

interface SyncServerResponse {
  counter: number,
}
interface EventsResponse extends SyncServerResponse {
  events: Event[],
}

interface SyncServer {
  // throws CounterTooHighError when counter is larger than what the server knows
  getEventsSince(lastKnownCounter: number): Promise<EventsResponse>
  // returns the current server counter, this method should return synchronous
  sendEvents(events: Event[]): Promise<SyncServerResponse>
}

/**
 * Manages persistent information for this peer.
 */
class Peer {
  getId(): string {
    throw new Error('unimplemented')
  }
  getLastKnownServerCounter(): number {
    throw new Error('unimplemented')
  }
  setLastKnownServerCounter(counter: number): void {
    throw new Error('unimplemented')
  }
  getVectorClock(): VectorClock {
    throw new Error('unimplemented')
  }
  updateVectorClock(newClock: VectorClock): void {
    throw new Error('unimplemented')
  }
}

const thisPeer = new Peer()

const INCOMING_EVENTLOG
const OUTGOING_EVENTLOG
const MAIN_EVENTLOG

export class EventlogRepository implements Repository {
  // createNode(id: string, name: string, content: string): Promise<RepositoryNode>
  // updateNode(node: RepositoryNode): Promise<void>
  // reparentNode(childId: string, parentId: string, position: RelativeNodePosition): Promise<void>

  // getChildIds(nodeId: string): Promise<string[]>
  // getParentId(nodeId: string): Promise<string>

  // loadNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode>
  // loadTree(nodeId: string): Promise<LoadedTree>

}

/**
 * This is a repository implementation that uses an event log, vector clocks and a synchronisation backend
 * to provide an eventually consistent, multi-peer, storage backend.
 */
import {Repository} from './repository'

interface VectorClock {

}

enum EventType {
  ADD_NODE,
  UPDATE_NODE,
  REPARENT_NODE,
}

interface Event {
  originatorId: string,
  type: EventType,
  vc: VectorClock,
  payload: 
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
  getVectorClock(): VectorClock {
    throw new Error('unimplemented')
  }
  updateVectorClock(newClock: VectorClock): void {
    throw new Error('unimplemented')
  }
}

const thisPeer = new Peer()

export class EventlogRepository implements Repository {
  // createNode(id: string, name: string, content: string): Promise<RepositoryNode>
  // updateNode(node: RepositoryNode): Promise<void>
  // reparentNode(childId: string, parentId: string, position: RelativeNodePosition): Promise<void>

  // getChildIds(nodeId: string): Promise<string[]>
  // getParentId(nodeId: string): Promise<string>

  // loadNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode>
  // loadTree(nodeId: string): Promise<LoadedTree>

}
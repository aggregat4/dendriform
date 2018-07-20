import {QueryableEventLog, EventLogCounter, DEvent, EventSubscriber, Predicate} from './eventlog'
import {Dexie} from 'dexie'
import {generateUUID} from '../util'
import {VectorClock} from '../lib/vectorclock'

/**
 * An event log implementation for the client that uses IndexedDb as a persistent
 * store for its own metadata and its eventlog
 *
 * TODO: do we need to make this multi document capable? Currently assumes one log, one document
 */
class LocalEventLog implements QueryableEventLog {

  readonly db = new Dexie('dendriform-localeventlog')
  private peerId
  private vectorClock

  constructor() {
    this.initDb()
    this.loadOrCreateMetadata()
    this.loadEventLog()
  }

  private initDb(): void {
    this.db.version(1).stores({
      peer: '', // columns: eventlogid, vectorclock
      eventlog: '++eventid,treenodeid', // columns: eventid, treenodeid, event
    })
    this.db.open()
  }

  private loadOrCreateMetadata(): void {
    this.db.table('peer').toArray().then(metadata => {
      if (!metadata || metadata.length === 0) {
        this.peerId = generateUUID()
        this.vectorClock = new VectorClock()
        // always start a new vectorclock on 1 for the current peer
        this.vectorClock.increment(this.peerId)
        this.db.table('peer').put({eventlogid: this.peerId, vectorclock: this.vectorClock.serialize()})
      } else {
        this.peerId = metadata[0].peerid
        this.vectorClock = VectorClock.deserialize(metadata[0].vectorclock)
      }
    })
  }

  private loadEventLog(): void {
    // TODO: load all the events from the store and create the in memory 
  }

  getId(): string {
    return this.peerId
  }

  /**
   * 1. persist the envent in indexeddb
   * 2. update the in memory sorted array of event references (vc,id,peerid)
   * 3. (later) update the in memory maps (parent map, child map)
   * 4. (later) compact the store by removing redundant events
   * 5. notify any subscribers that are interested
   * 
   * @param events The events to persist and rebroadcast.
   */
  publish(events: DEvent[]): Promise<EventLogCounter> {
    // TODO: implement
  }

  subscribe(listener: EventSubscriber, eventFilter: Predicate): void {
    // TODO: implement
  }

  // // throws CounterTooHighError when counter is larger than what the server knows
  // getEventsSince(counter: number): Promise<Events>
  // getChildIds(nodeId: string): Promise<string[]>
  // getParentId(nodeId: string): Promise<string>
  // loadNode(nodeId: string, nodeFilter: Predicate): Promise<RepositoryNode>
  // loadTree(nodeId: string, nodeFilter: Predicate): Promise<LoadedTree>

}

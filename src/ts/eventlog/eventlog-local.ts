// tslint:disable-next-line:max-line-length
import {EventLogCounter, DEvent, TreeQueryable, DEventLog, AddOrUpdateNodeEventPayload, ReparentNodeEventPayload, EventType, EventSubscriber, DEventSource} from './eventlog'
import {Dexie} from 'dexie'
import {generateUUID} from '../util'
import {VectorClock} from '../lib/vectorclock'

interface StoredEvent {
  eventid?: number,
  treenodeid: string,
  peerid: string,
  vectorclock: VectorClock,
  payload: AddOrUpdateNodeEventPayload | ReparentNodeEventPayload,
}

/**
 * An event log implementation for the client that uses IndexedDb as a persistent
 * store for its own metadata and its eventlog
 *
 * TODO: do we need to make this multi document capable? Currently assumes one log, one document
 */
export class LocalEventLog implements DEventSource, DEventLog {

  readonly db = new Dexie('dendriform-localeventlog')
  private peerId: string
  private vectorClock: VectorClock
  private counter: EventLogCounter
  private subscribers: EventSubscriber[] = []

  constructor() {
    this.initDb()
    this.loadOrCreateMetadata()
  }

  private initDb(): void {
    this.db.version(1).stores({
      peer: '', // columns: eventlogid, vectorclock, counter
      nodeeventlog: '++eventid,treenodeid', // see StoredEvent for schema
      treeeventlog: '++eventid,treenodeid', // see StoredEvent for schema
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
        this.counter = 1
        this.db.table('peer').put({eventlogid: this.peerId, vectorclock: this.vectorClock, counter: this.counter})
      } else {
        const md = metadata[0]
        this.peerId = md.peerid
        this.vectorClock = md.vectorclock
        this.counter = md.counter
      }
    })
  }

  publish(type: EventType, nodeId: string,
          payload: AddOrUpdateNodeEventPayload | ReparentNodeEventPayload): Promise<any> {
    this.vectorClock.increment(this.peerId)
    const event = new DEvent(
      type,
      this.peerId,
      this.vectorClock,
      nodeId,
      payload,
    )
    return this.insert(event)
  }

  /**
   * 1. persist the event in indexeddb
   * 2. compact the store by removing redundant events
   * 3. (later) update the in memory maps (parent map, child map)
   * 5. notify any subscribers that are interested
   *
   * @param events The events to persist and rebroadcast.
   */
  insert(event: DEvent): Promise<EventLogCounter> {
    const table = event.type === EventType.ADD_OR_UPDATE_NODE ?
      this.db.table('nodeeventlog') :
      this.db.table('treeeventlog')
    return this.storeAndGarbageCollect(table, event)
      .then(() => this.notifySubscribers(event))
      .then(() => this.incrementCounter())
  }

  subscribe(subscriber: EventSubscriber): void {
    this.subscribers.push(subscriber)
  }

  private incrementCounter(): EventLogCounter {
    this.counter++
    return this.counter
  }

  private notifySubscribers(e: DEvent): void {
    for (const subscriber of this.subscribers) {
      if (subscriber.filter(e)) {
        subscriber.notify(e)
      }
    }
  }

  private storeAndGarbageCollect(table: any, event: DEvent): Promise<any> {
    return table.put({
      treenodeid: event.nodeId,
      peerid: event.originator,
      vectorclock: event.clock,
      payload: event.payload,
    })
    .then(() => table.where('treenodeid').equals(event.nodeId).toArray())
    .then((nodeEvents: StoredEvent[]) => {
      this.sortAndPruneEvents(nodeEvents)
      return table.bulkDelete(nodeEvents.map((e) => e.eventid))
    })
    .catch(err => {
      // TODO: do something more clever with errors?
      // tslint:disable-next-line:no-console
      console.error(`ERROR occurred during nodeEvent storage: `, err)
    })
  }

  private sortAndPruneEvents(events: StoredEvent[]): void {
    if (events.length > 1) {
      // sort event array by vectorclock and peerid
      // remove all but the last event
      events.sort((a, b) => {
        const vcComp = a.vectorclock.compare(b.vectorclock)
        if (vcComp === 0) {
          return a.peerid < b.peerid ? -1 : (a.peerid > b.peerid ? 1 : 0)
        } else {
          return vcComp
        }
      })
      // remove the last element, which is the latest event which we want to retain
      events.splice(-1 , 1)
    }
  }

  // // throws CounterTooHighError when counter is larger than what the server knows
  // getEventsSince(counter: number): Promise<Events>
  // getChildIds(nodeId: string): Promise<string[]>
  // getParentId(nodeId: string): Promise<string>
  // loadNode(nodeId: string, nodeFilter: Predicate): Promise<RepositoryNode>
  // loadTree(nodeId: string, nodeFilter: Predicate): Promise<LoadedTree>

}

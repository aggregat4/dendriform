// tslint:disable-next-line:max-line-length
import {DEvent, DEventLog, EventType, EventSubscriber, DEventSource, CounterTooHighError, Events, EventGcInclusionFilter} from './eventlog'
import Dexie from 'dexie'
import {generateUUID} from '../util'
import {VectorClock} from '../lib/vectorclock'

interface StoredEvent<T> {
  eventid?: number,
  eventtype: number,
  treenodeid: string,
  peerid: string,
  vectorclock: VectorClock,
  payload: T,
}

/**
 * An event log implementation for the client that uses IndexedDb as a persistent
 * store for its own metadata and its eventlog
 *
 * TODO: do we need to make this multi document capable? Currently assumes one log, one document
 */
export class LocalEventLog<T> implements DEventSource<T>, DEventLog<T> {

  readonly db
  private peerId: string
  private vectorClock: VectorClock
  private counter: number
  private subscribers: Array<EventSubscriber<T>> = []

  constructor(readonly dbName: string, readonly gcFilter?: EventGcInclusionFilter<T>) {
    this.db = new Dexie(dbName)
  }

  init(): Promise<LocalEventLog<T>> {
    this.db.version(1).stores({
      peer: 'eventlogid', // columns: eventlogid, vectorclock, counter
      eventlog: '++eventid,treenodeid', // see StoredEvent for schema
    })
    return this.db.open().then(() => this.loadOrCreateMetadata()).then(() => this)
  }

  private loadOrCreateMetadata(): Promise<void> {
    return this.db.table('peer').toArray().then(metadata => {
      if (!metadata || metadata.length === 0) {
        this.peerId = generateUUID()
        this.vectorClock = new VectorClock()
        // always start a new vectorclock on 1 for the current peer
        this.vectorClock.increment(this.peerId)
        this.counter = 1
        return this.saveMetadata()
      } else {
        const md = metadata[0]
        this.peerId = md.eventlogid
        this.vectorClock = new VectorClock(md.vectorClock)
        this.counter = md.counter
      }
    })
  }

  private saveMetadata(): Promise<any> {
    const metadata = {
      eventlogid: this.peerId,
      vectorclock: this.vectorClock.values,
      counter: this.counter,
    }
    return this.db.table('peer').put(metadata)
      .catch(error => console.error(`saveMetadata error: `, error))
  }

  getId(): string {
    return this.peerId
  }

  getCounter(): number {
    return this.counter
  }

  publish(type: EventType, nodeId: string, payload: T): Promise<any> {
    this.vectorClock.increment(this.peerId)
    return this.insert(new DEvent<T>(
      type,
      this.peerId,
      this.vectorClock,
      nodeId,
      payload,
    ))
  }

  /**
   * 1. persist the event in indexeddb
   * 2. compact the store by removing redundant events
   * 3. (later) update the in memory maps (parent map, child map)
   * 4. async notify any subscribers that are interested
   *
   * @param events The events to persist and rebroadcast.
   */
  insert(event: DEvent<T>): Promise<any> {
    return this.storeAndGarbageCollect(event)
      .then(storedEvent => { this.counter = storedEvent.eventid })
      .then(() => this.saveMetadata())
      .then(() => window.setTimeout(() => this.notifySubscribers(event), 1))
      .catch((err) => {
        // TODO: do something more clever with errors?
        // tslint:disable-next-line:no-console
        console.error(`ERROR occurred during nodeEvent storage: `, err)
      })
  }

  subscribe(subscriber: EventSubscriber<T>): void {
    this.subscribers.push(subscriber)
  }

  private storedEventToDEventMapper(ev: StoredEvent<T>): DEvent<T> {
    return new DEvent(ev.eventtype, ev.peerid, new VectorClock(ev.vectorclock), ev.treenodeid, ev.payload)
  }

  /**
   * Loads all events that a counter that is higher than or equal to the provided number.
   * Throws CounterTooHighError when the provided counter is higher than the max counter
   * of the eventlog. The array is causally sorted by vectorclock and peerid.
   */
  getEventsSince(counter: number): Promise<Events<T>> {
    if (counter > this.counter) {
      throw new CounterTooHighError(`The eventlog has a counter of ${this.counter}` +
        ` but events were requested since ${counter}`)
    }
    const table = this.db.table('eventlog')
    return table.where('eventid').aboveOrEqual(counter).toArray()
      .then((events: Array<StoredEvent<T>>) => this.sortCausally(events))
      .then((events: Array<StoredEvent<T>>) => events.map(this.storedEventToDEventMapper))
      .then((events: Array<DEvent<T>>) => ({counter: this.counter, events}))
  }

  getEventsForNode(nodeId: string): Promise<Array<DEvent<T>>> {
    const table = this.db.table('eventlog')
    return table.where('treenodeid').equals(nodeId).toArray()
      .then((events: Array<StoredEvent<T>>) => events.map(this.storedEventToDEventMapper))
  }

  private notifySubscribers(e: DEvent<T>): void {
    for (const subscriber of this.subscribers) {
      if (subscriber.filter(e)) {
        subscriber.notify(e)
      }
    }
  }

  private async storeAndGarbageCollect(event: DEvent<T>): Promise<StoredEvent<T>> {
    const storedEvent = await this.store(event)
    await this.garbageCollect(event)
    return storedEvent
  }

  private store(event: DEvent<T>): Promise<StoredEvent<T>> {
    const table = this.db.table('eventlog')
    return table.put({
      eventtype: event.type,
      treenodeid: event.nodeId,
      peerid: event.originator,
      vectorclock: event.clock,
      payload: event.payload,
    }).catch(error => console.error(`store error: `, error))
  }

  private garbageCollect(event: DEvent<T>): Promise<any> {
    const table = this.db.table('eventlog')
    return table.where('treenodeid').equals(event.nodeId).toArray()
      .then((nodeEvents: Array<StoredEvent<T>>) => {
        const eventsToDelete = this.sortAndPruneEvents(nodeEvents, event)
        if (eventsToDelete.length > 0) {
          // console.log(`garbageCollect: bulkdelete of `, eventsToDelete)
          return table.bulkDelete(eventsToDelete.map((e) => e.eventid))
        }
      })
  }

  private sortAndPruneEvents(events: Array<StoredEvent<T>>, newEvent: DEvent<T>): Array<StoredEvent<T>> {
    if (events.length > 1) {
      // if we have a garbagecollectionfilter set we need to remove all stored events that are not
      // included by it (this is needed when the treenode itself is not sufficient for filtering)
      if (this.gcFilter) {
        events = events.filter(ev => this.gcFilter(newEvent.payload, ev.payload))
      }
      this.sortCausally(events)
      // remove the last element, which is also the newest event which we want to retain
      events.splice(-1 , 1)
      return events
    } else {
      return []
    }
  }

  // sort event array by vectorclock and peerid
  private sortCausally(events: Array<StoredEvent<T>>): Array<StoredEvent<T>> {
    events.sort((a, b) => {
      const vcComp = VectorClock.compareValues(a, b)
      if (vcComp === 0) {
        return a.peerid < b.peerid ? -1 : (a.peerid > b.peerid ? 1 : 0)
      } else {
        return vcComp
      }
    })
    return events
  }

}

// tslint:disable-next-line:max-line-length
import {EventLogCounter, DEvent, DEventLog, EventType, EventSubscriber, DEventSource, CounterTooHighError, Events} from './eventlog'
import {Dexie} from 'dexie'
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
  private counter: EventLogCounter
  private subscribers: Array<EventSubscriber<T>> = []

  constructor(readonly dbName: string) {
    this.db = new Dexie(dbName)
    this.initDb()
    this.loadOrCreateMetadata()
  }

  private initDb(): void {
    this.db.version(1).stores({
      peer: '', // columns: eventlogid, vectorclock, counter
      eventlog: '++eventid,treenodeid', // see StoredEvent for schema
      // treeeventlog: '++eventid,treenodeid', // see StoredEvent for schema
    })
    this.db.open()
  }

  private loadOrCreateMetadata(): Promise<any> {
    return this.db.table('peer').toArray().then(metadata => {
      if (!metadata || metadata.length === 0) {
        this.peerId = generateUUID()
        this.vectorClock = new VectorClock()
        // always start a new vectorclock on 1 for the current peer
        this.vectorClock.increment(this.peerId)
        this.counter = 0
        this.saveMetadata()
      } else {
        const md = metadata[0]
        this.peerId = md.peerid
        this.vectorClock = md.vectorclock
        this.counter = md.counter
      }
    })
  }

  private saveMetadata(): Promise<any> {
    return this.db.table('peer').put({
      eventlogid: this.peerId,
      vectorclock: this.vectorClock,
      counter: this.counter,
    })
  }

  getId(): string {
    return this.peerId
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
  insert(event: DEvent<T>): Promise<EventLogCounter> {
    try {
      const result: Promise<EventLogCounter> = this.storeAndGarbageCollect(event)
        .then(storedEvent => { this.counter = storedEvent.eventid })
        .then(() => this.saveMetadata())
      window.setTimeout(() => this.notifySubscribers(event), 1)
      return result
    } catch (err) {
      // TODO: do something more clever with errors?
      // tslint:disable-next-line:no-console
      console.error(`ERROR occurred during nodeEvent storage: `, err)
    }
  }

  subscribe(subscriber: EventSubscriber<T>): void {
    this.subscribers.push(subscriber)
  }

  /**
   * Loads all events that a counter that is higher than or equal to the provided number.
   * Throws CounterTooHighError when the provided counter is higher than the max counter
   * of the eventlog.
   * TODO: if ever we do not just have one event per node in here, we need to make sure
   * this list is sorted, or at the very least we have a sorted version of this
   */
  getEventsSince(counter: number): Promise<Events<T>> {
    if (counter > this.counter) {
      throw new CounterTooHighError(`The eventlog has a counter of ${this.counter}` +
        ` but events were requested since ${counter}`)
    }
    const table = this.db.table('eventlog')
    return table.where('eventid').aboveOrEqual(counter).toArray()
      .then((events: Array<StoredEvent<T>>) => events.map(ev =>
        new DEvent(ev.eventtype, ev.peerid, ev.vectorclock, ev.treenodeid, ev.payload)))
      .then((events: Array<DEvent<T>>) => ({counter: this.counter, events}))
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
    await this.garbageCollect(event.nodeId)
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
    })
  }

  private garbageCollect(nodeId: string): Promise<any> {
    const table = this.db.table('eventlog')
    return table.where('treenodeid').equals(nodeId).toArray()
      .then((nodeEvents: Array<StoredEvent<T>>) => {
        this.sortAndPruneEvents(nodeEvents)
        return table.bulkDelete(nodeEvents.map((e) => e.eventid))
      })
  }

  private sortAndPruneEvents(events: Array<StoredEvent<T>>): void {
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

}

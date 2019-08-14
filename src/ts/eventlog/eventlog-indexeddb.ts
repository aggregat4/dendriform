// tslint:disable-next-line:max-line-length
import { DEvent, DEventLog, EventType, EventSubscriber, DEventSource, CounterTooHighError, Events, EventPayloadType, ReorderChildNodeEventPayload } from './eventlog'
import Dexie from 'dexie'
import { generateUUID } from '../utils/util'
import { VectorClock } from '../lib/vectorclock'
import { ActivityIndicating } from '../domain/domain'
import { LocalEventLogGarbageCollector } from './eventlog-indexeddb-gc'
import { LocalEventLogIdMapper } from './eventlog-indexeddb-peerid-mapper'

/**
 * "Database Schema" for events stored in the 'eventlog' table in the indexeddb.
 */
export interface StoredEvent {
  eventid?: number,
  eventtype: number,
  treenodeid: string,
  peerid: string,
  vectorclock: VectorClock,
  payload: EventPayloadType,
}

export function storedEventComparator(a: StoredEvent, b: StoredEvent): number {
  const vcComp = VectorClock.compareValues(a.vectorclock, b.vectorclock)
  if (vcComp === 0) {
    return a.peerid < b.peerid ? -1 : (a.peerid > b.peerid ? 1 : 0)
  } else {
    return vcComp
  }
}

/**
 * An event log implementation for the client that uses IndexedDb as a persistent
 * store for its own metadata and its eventlog
 *
 * TODO: do we need to make this multi document capable? Currently assumes one log, one document
 */
export class LocalEventLog implements DEventSource, DEventLog, ActivityIndicating {

  readonly db: Dexie
  readonly name: string
  private peerId: string
  private vectorClock: VectorClock
  private counter: number
  private subscribers: EventSubscriber[] = []
  // event storage queue
  private storageQueue: DEvent[] = []
  private lastStorageTimestamp: number = 0
  private readonly STORAGE_QUEUE_TIMEOUT_MS = 25
  private readonly STORAGE_QUEUE_MAX_LATENCY_MS = 250
  /**
   * The max batch size until we start storing, or the value of events we drain from the queue
   * if many more are available. 500 causes warning on the handler taking too long. This will
   * be platform/device dependent therefore we should probably measure storage times and adapt
   * this dynamically.
   */
  private readonly STORAGE_QUEUE_BATCH_SIZE = 200
  private garbageCollector: LocalEventLogGarbageCollector
  private peeridMapper: LocalEventLogIdMapper
  // DEBUG
  private lastStoreMeasurement: number = 0
  private storeCount: number = 0

  constructor(readonly dbName: string) {
    this.db = new Dexie(dbName)
    this.name = dbName
  }

  isActive(): boolean {
    return this.storageQueue.length > 0
  }

  getActivityTitle(): string {
    return `Processing ${this.storageQueue.length} queued commands...`
  }

  getPeerId(): string {
    return this.peerId
  }

  getName(): string {
    return this.name
  }

  getCounter(): number {
    return this.counter
  }

  async init(): Promise<LocalEventLog> {
    this.db.version(1).stores({
      peer: 'eventlogid', // columns: eventlogid, vectorclock, counter
      eventlog: '++eventid,eventtype,[eventtype+treenodeid],[treenodeid+eventid]', // see StoredEvent for schema
    })
    await this.db.open()
    await this.loadOrCreateMetadata()
    // start async event storage
    await this.drainStorageQueue()
    this.garbageCollector = new LocalEventLogGarbageCollector(this, this.db.table('eventlog'))
    this.garbageCollector.start()
    this.peeridMapper = new LocalEventLogIdMapper(this.dbName + '-peerid-mapping')
    await this.peeridMapper.init()
    return this
  }

  /**
   * This method automatically reschedules itself to execute after this.STORAGE_QUEUE_TIMEOUT_MS.
   *
   * @param force Whether to force storage or not. When this is true and there are events in
   * the queue, then they will be stored. Can be useful for implementing synchronous storage.
   */
  private async drainStorageQueue(force: boolean = false): Promise<any> {
    const currentTime = Date.now()
    const timeSinceLastStore = currentTime - this.lastStorageTimestamp
    if (this.storageQueue.length > 0 &&
        (force ||
         this.storageQueue.length >= this.STORAGE_QUEUE_BATCH_SIZE ||
         timeSinceLastStore > this.STORAGE_QUEUE_MAX_LATENCY_MS)) {
      const drainedEvents = this.storageQueue.splice(0, this.STORAGE_QUEUE_BATCH_SIZE)
      await this.storeEvents(drainedEvents)
      this.lastStorageTimestamp = currentTime
    }
    window.setTimeout(this.drainStorageQueue.bind(this), this.STORAGE_QUEUE_TIMEOUT_MS)
  }

  private async storeEvents(events: DEvent[]): Promise<any> {
    const eventCounter = await this.store(events)
    // We only store the latest eventid as the new max counter if it is really
    // higher than the current state. In case of concurrent updates to the db
    // (for example a local insert and some remote server events) it may happen
    // that the updates are interleaved and we need to check here whether we
    // really do have the largest counter.
    if (eventCounter > this.counter) {
      this.counter = eventCounter
    }
    await this.saveMetadata()
    this.notifySubscribers(events)
    // DEBUG timing output
    // TODO: put this in some metrics package with generic measurements so we can more easily instrument?
    this.storeCount += events.length
    const currentTime = Date.now()
    const measuredTime = currentTime - this.lastStoreMeasurement
    if (measuredTime > 5000) {
      console.debug(`Store event throughput: ${this.storeCount / (measuredTime / 1000)} per s`)
      this.lastStoreMeasurement = currentTime
      this.storeCount = 0
    }
  }

  private store(events: DEvent[]): Promise<number> {
    const table = this.db.table('eventlog')
    // console.debug(`Storing event at counter ${this.counter}`)
    return table.bulkPut(events.map(e => {
      return {
        eventtype: e.type,
        treenodeid: e.nodeId,
        peerid: this.peeridMapper.externalToInternalPeerId(e.originator),
        vectorclock: this.peeridMapper.externalToInternalVectorclock(e.clock),
        payload: e.payload,
      }})).catch(error => console.error(`store error: `, error))
  }

  private loadOrCreateMetadata(): Promise<void> {
    return this.db.table('peer').toArray().then(metadata => {
      if (!metadata || metadata.length === 0) {
        this.peerId = generateUUID()
        this.vectorClock = new VectorClock()
        // always start a new vectorclock on 1 for the current peer
        this.vectorClock.increment(this.peerId)
        // it is important that the counter starts at 0: we later set the counter
        // to be the primary key that is generated by dexie in the indexeddb,
        // if we set it to 1, it will have that value double
        this.counter = 0
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

  publish(type: EventType, nodeId: string, payload: EventPayloadType, synchronous: boolean): Promise<any> {
    this.vectorClock.increment(this.peerId)
    return this.insert([new DEvent(type, this.peerId, this.vectorClock, nodeId, payload)], synchronous)
  }

  /**
   * 1. persist the event in indexeddb
   * 2. compact the store by removing redundant events
   * 3. (later) update the in memory maps (parent map, child map)
   * 4. async notify any subscribers that are interested
   *
   * @param events The events to persist and rebroadcast.
   */
  async insert(events: DEvent[], synchronous: boolean): Promise<any> {
    if (events.length === 0) {
      return Promise.resolve()
    }
    try {
      this.storageQueue.push(...events)
      if (synchronous) {
        await this.drainStorageQueue(true)
      }
      return Promise.resolve()
    } catch (err) {
      // tslint:disable-next-line:no-console
      console.error(`ERROR occurred during nodeEvent storage: `, err)
    }
  }

  subscribe(subscriber: EventSubscriber): void {
    this.subscribers.push(subscriber)
  }

  getAllEventsSince(peerId: string, fromCounterNotInclusive: number): Promise<Events> {
    if (fromCounterNotInclusive > this.counter) {
      throw new CounterTooHighError(`The eventlog has a counter of ${this.counter}` +
        ` but events were requested since ${fromCounterNotInclusive}`)
    }
    const table = this.db.table('eventlog')
    const localPeerId = this.peeridMapper.externalToInternalPeerId(peerId)
    // TODO: this currently retrieves ALL events since a certain counter, we will need to move to batching at some point
    const query = table.where('[treenodeid+eventid]').between(
      [localPeerId, fromCounterNotInclusive],
      [localPeerId, Number.MAX_SAFE_INTEGER],
      false, // do not include lower bound
      false) // do not include upper bound
    return this.processRetrievedEvents(query.toArray())
  }

  getAllEventsFromType(eventType: EventType): Promise<Events> {
    const table = this.db.table('eventlog')
    const query = table.where('eventtype').equals(eventType)
    return this.processRetrievedEvents(query.toArray())
  }

  private processRetrievedEvents(storedEvents: Promise<StoredEvent[]>): Promise<Events> {
    return storedEvents.then((events: StoredEvent[]) => {
      events.sort(storedEventComparator)
      // This code is a bit of a cop out: we should not need this since this.counter is always
      // set to the highest stored event id when we insert() it into the database.
      // However we observed a counter being one off (and lower) than the real max event
      // and this causes a endless loop of claiming to have new events and pushing it to the
      // server. This is a sort of sanity check to correct the counter should it be off.
      // I have no idea why the code in insert() should not suffice.
      let wasMaxCounterUpdated = false
      for (const event of events) {
        if (event.eventid > this.counter) {
          console.warn(`Unexpected state: local counter is not the max event id in the db, this should not happen (see insert())`)
          this.counter = event.eventid
          wasMaxCounterUpdated = true
        }
      }
      if (wasMaxCounterUpdated) {
        this.saveMetadata()
      }
      return events.map(e => this.peeridMapper.storedEventToDEventMapper(e))
    })
    .then((events: DEvent[]) => ({counter: this.counter, events}))
  }

  getNodeEvent(nodeId: string): Promise<DEvent> {
    const table = this.db.table('eventlog')
    return table.where('[eventtype+treenodeid]').equals([EventType.ADD_OR_UPDATE_NODE, nodeId]).toArray()
      .then((events: StoredEvent[]) => {
        if (events.length === 0) {
          return null
        }
        // It can happen that we get multiple events for one node, depending on whether
        // the garbage collection has already run or not for this event. So we may need
        // to do some ad hoc garbage collection here.
        if (events.length > 1) {
          events.sort(storedEventComparator)
        }
        return this.peeridMapper.storedEventToDEventMapper(events[events.length - 1])
      })
  }

  private notifySubscribers(events: DEvent[]): void {
    for (const subscriber of this.subscribers) {
      const filteredEvents = events.filter((e) => subscriber.filter(e))
      if (filteredEvents.length > 0) {
        window.setTimeout(() => {
          // console.debug(`Notifying subscriber`)
          subscriber.notify(filteredEvents)
        }, 1)
      }
    }
  }

}

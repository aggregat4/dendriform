import {
  DEvent,
  DEventLog,
  EventType,
  EventSubscriber,
  DEventSource,
  CounterTooHighError,
  Events,
  EventPayloadType,
  createNewAddOrUpdateNodeEventPayload,
} from './eventlog'
import Dexie from 'dexie'
import {generateUUID} from '../utils/util'
import {VectorClock, NumberVectorClockValues, StringVectorClockValues} from '../lib/vectorclock'
import {ActivityIndicating, Subscription, Initializeable} from '../domain/domain'
import {LocalEventLogGarbageCollector} from './eventlog-indexeddb-gc'
import {LocalEventLogIdMapper} from './eventlog-indexeddb-peerid-mapper'
import {JobScheduler, FixedTimeoutStrategy} from '../utils/jobscheduler'

/**
 * "Database Schema" for events stored in the 'eventlog' table in the indexeddb.
 */
export interface StoredEvent {
  eventid: number,
  eventtype: number,
  treenodeid: string,
  peerid: string,
  vectorclock: NumberVectorClockValues,
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

interface PeerMetadata {
  eventlogid: string,
  vectorclock: any,
  counter: number,
}

class EventSubscription implements Subscription {
  constructor(
    readonly cancelCallback: (subscription: Subscription) => void,
    readonly subscriber: EventSubscriber) {}

  cancel(): void {
    this.cancelCallback(this)
  }
}

/**
 * An event log implementation for the client that uses IndexedDb as a persistent
 * store for its own metadata and its eventlog
 *
 * TODO: do we need to make this multi document capable? Currently assumes one log, one document
 */
export class LocalEventLog implements DEventSource, DEventLog, ActivityIndicating, Initializeable {

  private db: Dexie
  private readonly name: string
  private peerId: string
  private vectorClock: VectorClock<StringVectorClockValues>
  private counter: number
  private subscriptions: EventSubscription[] = []
  // event storage queue
  private storageQueue: DEvent[] = []
  private lastStorageTimestamp: number = 0
  private readonly STORAGE_QUEUE_TIMEOUT_MS = 150
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
  private storageQueueDrainer: JobScheduler = new JobScheduler(
    new FixedTimeoutStrategy(this.STORAGE_QUEUE_TIMEOUT_MS), this.drainStorageQueUnforced.bind(this))

  constructor(readonly dbName: string) {
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

  async init(): Promise<void> {
    try {
      this.db = new Dexie(this.dbName)
      this.db.version(1).stores({
        peer: 'eventlogid', // columns: eventlogid, vectorclock, counter
        // Apparently a bug in Chrome and Firefox prevents us from using an autogenerated ID in a compound index: https://github.com/dfahlander/Dexie.js/issues/751
        eventlog: 'eventid,eventtype,[eventtype+treenodeid],[peerid+eventid]', // see StoredEvent for schema
      })
      await this.db.open()
      await this.loadOrCreateMetadata()
      await this.determineMaxCounter()
      this.peeridMapper = new LocalEventLogIdMapper(this.dbName + '-peerid-mapping')
      await this.peeridMapper.init()
      // NOTE: we need a peeridMapper to store events! It is used to translate the ids!
      // Make sure we have a ROOT node and if not, create it
      const rootNode = await this.getNodeEvent('ROOT')
      if (!rootNode) {
        await this.publish(EventType.ADD_OR_UPDATE_NODE, 'ROOT', createNewAddOrUpdateNodeEventPayload('ROOT', null, false, false, false), true)
      }
      // start async event storage
      this.storageQueueDrainer.start(true)
      // start garbage collector
      this.garbageCollector = new LocalEventLogGarbageCollector(this, this.db.table('eventlog'))
      this.garbageCollector.start()
    } catch (error) {
      console.error(`Error initialising indexeddb eventlog, note that Firefox does not (yet) allow IndexedDB in private browsing mode: `, error)
    }
  }

  async deinit(): Promise<void> {
    if (this.db) {
      await this.garbageCollector.stopAndWaitUntilDone()
      await this.storageQueueDrainer.stopAndWaitUntilDone()
      this.peeridMapper.deinit()
      this.db.close()
      this.db = null
    }
  }

  private async drainStorageQueUnforced(): Promise<void> {
    return this.drainStorageQueue(false)
  }

  /**
   * Events are actually really stored immediately when:
   * - the force parameter is true
   * - OR the current storage queue is larger than our max batch size (this.STORAGE_QUEUE_BATCH_SIZE)
   * - OR the time since we last stored something is larger than our maximum storage latency (this.STORAGE_QUEUE_MAX_LATENCY_MS)
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
      // We need to update our knowledge about causality in the world and make sure our vectorclock
      // updated to the latest state for each peer that is NOT ourselves (see publish())
      // storeEvents will save metadata
      drainedEvents
        .filter(e => e.originator !== this.getPeerId())
        .forEach(e => {
          console.debug(`foreign event, incrementing clock`)
          this.vectorClock.increment(this.peerId)
          const newClock = this.vectorClock.merge(e.clock)
          this.vectorClock = new VectorClock(newClock.values)
          e.clock = new VectorClock(newClock.values)
        })
      await this.storeEvents(drainedEvents)
      this.lastStorageTimestamp = currentTime
    }
  }

  private async storeEvents(events: DEvent[]): Promise<any> {
    await this.store(events)
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

  private async store(events: DEvent[]): Promise<void> {
    const table = this.db.table('eventlog')
    // console.debug(`Storing event at counter ${this.counter}`)
    try {
      // This is some (ugly?) special casing: we do not persist and create or update events on the ROOT node
      // performed by other peers. This is to make sure there is always only one ROOT node on each peer
      const mappedEvents = events
        .filter(e => !(e.type === EventType.ADD_OR_UPDATE_NODE && e.nodeId === 'ROOT' && e.originator !== this.peerId))
        .map(e => {
          return {
            // We preincrement the counter because our semantics are that counter is always the current
            // highest existing ID in the database
            eventid: ++this.counter,
            eventtype: e.type,
            treenodeid: e.nodeId,
            peerid: this.peeridMapper.externalToInternalPeerId(e.originator),
            vectorclock: this.peeridMapper.externalToInternalVectorclockValues(e.clock.values),
            payload: e.payload,
          }
        })
      return table.bulkPut(mappedEvents)
    } catch (error) {
      console.error(`store error: `, error)
    }
  }

  private loadOrCreateMetadata(): Promise<void> {
    return this.db.table('peer').toArray().then(metadata => {
      if (!metadata || metadata.length === 0) {
        console.log(`create new metadata`)
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
        console.log(`load existing metadata`)
        const md = metadata[0] as PeerMetadata
        this.peerId = md.eventlogid
        this.vectorClock = new VectorClock(md.vectorclock)
        this.counter = md.counter
      }
    })
  }

  private determineMaxCounter(): Promise<void> {
    return this.db.table('eventlog')
      .orderBy('eventid')
      .last()
      .then(lastEvent => {
        // if the db is empty then the lastevent is undefined
        if (lastEvent) {
          this.counter = lastEvent.eventid
        }
      })
  }

  private saveMetadata(): Promise<any> {
    console.debug(`saving metadata`)
    const metadata: PeerMetadata = {
      eventlogid: this.peerId,
      vectorclock: this.vectorClock.values,
      counter: this.counter,
    }
    return this.db.table('peer').put(metadata)
      .catch(error => console.error(`saveMetadata error: `, error))
  }

  publish(type: EventType, nodeId: string, payload: EventPayloadType, synchronous: boolean): Promise<any> {
    // We update the vectorclock for our own peer only in this location since we need a continuously up to date view
    // on the world. We increment our clock for other peer data in drainStorageQueue() where we only take into account
    // other peers. This can only happen there since that is the time where we persist the current state of the world
    // and the vectorclock should represent this.
    // However, this has a problem: if drainstorageQue happens later than the other peers will be slightly out
    // of date in our vectorclock. Not sure how to solve this.
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

  subscribe(subscriber: EventSubscriber): Subscription {
    const subscription = new EventSubscription(
      (subToCancel) => this.subscriptions = this.subscriptions.filter((sub) => sub !== subToCancel),
      subscriber)
    this.subscriptions.push(subscription)
    return subscription
  }

  getAllEventsSince(peerId: string, fromCounterNotInclusive: number): Promise<Events> {
    if (fromCounterNotInclusive > this.counter) {
      throw new CounterTooHighError(`The eventlog has a counter of ${this.counter}` +
        ` but events were requested since ${fromCounterNotInclusive}`)
    }
    const table = this.db.table('eventlog')
    const localPeerId = this.peeridMapper.externalToInternalPeerId(peerId)
    // TODO: this currently retrieves ALL events since a certain counter, we will need to move to batching at some point
    const query = table.where('[peerid+eventid]').between(
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
      for (const event of events) {
        if (event.eventid > this.counter) {
          throw Error(`Unexpected state: local counter is not the max event id in the db, this should not happen (see insert())`)
        }
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
    for (const subscription of this.subscriptions) {
      const subscriber = subscription.subscriber
      const filteredEvents = events.filter((e) => subscriber.filter(e))
      if (filteredEvents.length > 0) {
        window.setTimeout(() => {
          // console.debug(`Notifying subscriber`)
          subscriber.notify(filteredEvents)
        }, 0) // schedule at the earliest convenience
      }
    }
  }

}

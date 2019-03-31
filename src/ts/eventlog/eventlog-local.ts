// tslint:disable-next-line:max-line-length
import {DEvent, DEventLog, EventType, EventSubscriber, DEventSource, CounterTooHighError, Events, EventGcInclusionFilter, EventPayloadType, ReorderChildNodeEventPayload} from './eventlog'
import Dexie from 'dexie'
import {generateUUID} from '../util'
import {VectorClock} from '../lib/vectorclock'
import { ActivityIndicating } from '../domain/domain'

/**
 * "Database Schema" for events stored in the 'eventlog' table in the indexeddb.
 */
interface StoredEvent {
  eventid?: number,
  eventtype: number,
  treenodeid: string,
  peerid: string,
  vectorclock: VectorClock,
  payload: EventPayloadType,
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
  private externalToInternalIdMap: Map<string, number>
  private internalToExternalIdMap: Map<number, string>
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
  // DEBUG
  private lastStoreMeasurement: number = 0
  private storeCount: number = 0

  // For the child order event log we need a special garbage collection filter because
  // with logoot events for a sequence we don't just want to retain the newest event for each
  // parent, rather we need to retain the newest event for a particular child for that parent and
  // additionally take into account the operation type. We need to retain the newest DELETE as well
  // as INSERT operation so we can reliably rebuild the sequence
  // TODO: unsure whether it is "ok" to have this hardcoded knowledge about LOGOOT and the childorder
  // event log in this class. Alternatively we can define this somewhere else and inject a
  // Map<EventType, EventGcInclusionFilter> in this class
  private readonly LOGOOT_EVENT_GC_FILTER: EventGcInclusionFilter =
  (newEventPayload: ReorderChildNodeEventPayload, oldEventPayload: ReorderChildNodeEventPayload) => {
    return newEventPayload.childId === oldEventPayload.childId
      && newEventPayload.operation === oldEventPayload.operation
  }

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

  async init(): Promise<LocalEventLog> {
    this.db.version(1).stores({
      peer: 'eventlogid', // columns: eventlogid, vectorclock, counter
      eventlog: '++eventid,treenodeid', // see StoredEvent for schema
      peerid_mapping: 'externalid', // columns: externalid, internalid
    })
    await this.db.open()
    await this.loadOrCreateMetadata()
    await this.loadPeerIdMapping()
    await this.drainStorageQueue()
    return this
  }

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
    // TODO: implement garbage collection somehow (what is efficient for bulk updates?)
    // await this.garbageCollect(event)

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
      console.debug(`Store and GC event throughput: ${this.storeCount / (measuredTime / 1000)} per s`)
      this.lastStoreMeasurement = currentTime
      this.storeCount = 0
    }
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

  private async loadPeerIdMapping() {
    return this.db.table('peerid_mapping').toArray().then(mappings => {
      this.externalToInternalIdMap = new Map()
      this.internalToExternalIdMap = new Map()
      for (const mapping of mappings) {
        this.externalToInternalIdMap.set(mapping.externalid, mapping.internalid)
        this.internalToExternalIdMap.set(mapping.internalid, mapping.externalid)
      }
    })
  }

  private async savePeerIdMapping() {
    const mappings = []
    for (const [key, value] of this.externalToInternalIdMap.entries()) {
      mappings.push({externalid: key, internalid: value})
    }
    return this.db.table('peerid_mapping').bulkPut(mappings)
      .catch(error => console.error(`savePeerIdMapping error: `, error))
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

  publish(type: EventType, nodeId: string, payload: EventPayloadType, synchronous: boolean = false): Promise<any> {
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
      // TODO: do something more clever with errors?
      // tslint:disable-next-line:no-console
      console.error(`ERROR occurred during nodeEvent storage: `, err)
    }
  }

  subscribe(subscriber: EventSubscriber): void {
    this.subscribers.push(subscriber)
  }

  private storedEventToDEventMapper(ev: StoredEvent): DEvent {
    return new DEvent(ev.eventtype, this.internalToExternalPeerId(Number(ev.peerid)), this.internalToExternalVectorclock(ev.vectorclock), ev.treenodeid, ev.payload)
  }

  getEventsSince(eventTypes: EventType[], counter: number, peerId?: string): Promise<Events> {
    if (counter > this.counter) {
      throw new CounterTooHighError(`The eventlog has a counter of ${this.counter}` +
        ` but events were requested since ${counter}`)
    }
    const table = this.db.table('eventlog')
    let query = table.where('eventid').above(counter).and(event => eventTypes.indexOf(event.eventtype) !== -1)
    if (peerId) {
      query = query.and(event => event.peerid === peerId)
    }
    return query.toArray()
      .then((events: StoredEvent[]) => {
        this.sortCausally(events)
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
        return events.map(this.storedEventToDEventMapper.bind(this))
      })
      .then((events: DEvent[]) => ({counter: this.counter, events}))
  }

  getNodeEvent(nodeId: string): Promise<DEvent> {
    const table = this.db.table('eventlog')
    return table.where('treenodeid').equals(nodeId).and(event => event.eventtype === EventType.ADD_OR_UPDATE_NODE).toArray()
      .then((events: StoredEvent[]) => {
        if (events.length === 0) {
          return null
        }
        // It can happen that we get multiple events for one node, depending on whether
        // the garbage collection has already run or not for this event. So we may need
        // to do some ad hoc garbage collection here.
        if (events.length > 1) {
          this.sortCausally(events)
        }
        return this.storedEventToDEventMapper(events[events.length - 1])
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

  private findNextInternalId(): number {
    let largestId = 0
    for (const key of this.internalToExternalIdMap.keys()) {
      if (key > largestId) {
        largestId = key
      }
    }
    return largestId + 1
  }

  private externalToInternalPeerId(externalId: string): number {
    const existingMapping = this.externalToInternalIdMap.get(externalId)
    if (!existingMapping) {
      const newInternalId = this.findNextInternalId()
      this.externalToInternalIdMap.set(externalId, newInternalId)
      this.internalToExternalIdMap.set(newInternalId, externalId)
      this.savePeerIdMapping()
      return newInternalId
    } else {
      return existingMapping
    }
  }

  private internalToExternalPeerId(internalId: number): string {
    const existingExternalId = this.internalToExternalIdMap.get(internalId)
    if (!existingExternalId) {
      throw Error(`Invalid internalId ${internalId}`)
    } else {
      return existingExternalId
    }
  }

  /**
   * @returns A vectorclock where all node ids have been mapped from external UUIDs to
   * internal number ids. This never throws since an unknown nodeId is just added to the map.
   */
  private externalToInternalVectorclock(externalClock: VectorClock): VectorClock {
    const externalValues = externalClock.values
    const internalValues = {}
    for (const externalNodeId of Object.keys(externalValues)) {
      internalValues[this.externalToInternalPeerId(externalNodeId)] = externalValues[externalNodeId]
    }
    return new VectorClock(internalValues)
  }

  /**
   * @returns A vectorclock where all node ids have been mapped from internal numbers to
   * external UUIDs. This function throws when the internal id is unknown.
   */
  private internalToExternalVectorclock(internalClock: VectorClock): VectorClock {
    const internalValues = internalClock.values
    const externalValues = {}
    for (const internalNodeId of Object.keys(internalValues)) {
      externalValues[this.internalToExternalPeerId(Number(internalNodeId))] = internalValues[internalNodeId]
    }
    return new VectorClock(externalValues)
  }

  // TODO: react to errors better!
  private store(events: DEvent[]): Promise<number> {
    const table = this.db.table('eventlog')
    // console.debug(`Storing event at counter ${this.counter}`)
    return table.bulkPut(events.map(e => {
      return {
        eventtype: e.type,
        treenodeid: e.nodeId,
        peerid: this.externalToInternalPeerId(e.originator),
        vectorclock: this.externalToInternalVectorclock(e.clock),
        payload: e.payload,
      }})).catch(error => console.error(`store error: `, error))
  }

  private garbageCollect(event: DEvent): Promise<any> {
    const table = this.db.table('eventlog')
    return table.where('treenodeid').equals(event.nodeId)
      // TODO: (perf) make a compound key for treenodeid and eventtype so we can query directly for them
      .and(storedEvent => storedEvent.eventtype === event.type).toArray()
      .then((nodeEvents: StoredEvent[]) => {
        const eventsToDelete = this.findEventsToPrune(nodeEvents, event)
        if (eventsToDelete.length > 0) {
          // console.log(`garbageCollect: bulkdelete of `, eventsToDelete)
          return table.bulkDelete(eventsToDelete.map((e) => e.eventid))
        }
      })
  }

  private findEventsToPrune(events: StoredEvent[], newEvent: DEvent): StoredEvent[] {
    if (events.length > 1) {
      // if we have a garbagecollectionfilter set we need to remove all stored events that are not
      // included by it (this is needed when the treenode itself is not sufficient for filtering)
      if (newEvent.type === EventType.REORDER_CHILD) {
        events = events.filter(ev => this.LOGOOT_EVENT_GC_FILTER(newEvent.payload, ev.payload))
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
  private sortCausally(events: StoredEvent[]): StoredEvent[] {
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

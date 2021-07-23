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
import { generateUUID } from '../utils/util'
import { VectorClock } from '../lib/vectorclock'
import { ActivityIndicating, Subscription, LifecycleAware } from '../domain/domain'
import { LocalEventLogGarbageCollector } from './eventlog-indexeddb-gc'
import { LocalEventLogIdMapper } from './eventlog-indexeddb-peerid-mapper'
import { JobScheduler, FixedTimeoutStrategy } from '../utils/jobscheduler'
import { StoredEvent, storedEventComparator, PeerIdAndEventIdKeyType } from './eventlog-storedevent'
import {
  externalToInternalVectorclockValues,
  mapStoredEventToDEvent,
} from './eventlog-indexeddb-utils'
import { IdbEventRepository } from './idb-event-repository'

class EventSubscription implements Subscription {
  constructor(
    readonly cancelCallback: (subscription: Subscription) => void,
    readonly subscriber: EventSubscriber
  ) {}

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
export class LocalEventLog implements DEventSource, DEventLog, ActivityIndicating, LifecycleAware {
  private peerId: string
  private vectorClock: VectorClock
  private counter: number
  private subscriptions: EventSubscription[] = []
  // event storage queue
  private storageQueue: DEvent[] = []
  private lastStorageTimestamp = 0
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
  // DEBUG
  private lastStoreMeasurement = 0
  private storeCount = 0
  private storageQueueDrainer: JobScheduler = new JobScheduler(
    new FixedTimeoutStrategy(this.STORAGE_QUEUE_TIMEOUT_MS),
    this.drainStorageQueUnforced.bind(this)
  )

  constructor(
    readonly repository: IdbEventRepository,
    readonly peerIdMapper: LocalEventLogIdMapper
  ) {}

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
    return this.repository.getName()
  }

  getCounter(): number {
    return this.counter
  }

  async init(): Promise<void> {
    await this.loadOrCreateMetadata()
    const maxEventId = await this.repository.getMaxEventId()
    this.counter = maxEventId >= 0 ? maxEventId : 0
    // Make sure we have a ROOT node and if not, create it
    const rootNode = await this.getNodeEvent('ROOT')
    if (!rootNode) {
      await this.publish(
        EventType.ADD_OR_UPDATE_NODE,
        'ROOT',
        createNewAddOrUpdateNodeEventPayload('ROOT', null, false, false, false),
        true
      )
    }
    // start async event storage
    await this.storageQueueDrainer.start(true)
  }

  async deinit(): Promise<void> {
    await this.storageQueueDrainer.stopAndWaitUntilDone()
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
  private async drainStorageQueue(force = false): Promise<void> {
    const currentTime = Date.now()
    const timeSinceLastStore = currentTime - this.lastStorageTimestamp
    if (
      this.storageQueue.length > 0 &&
      (force ||
        this.storageQueue.length >= this.STORAGE_QUEUE_BATCH_SIZE ||
        timeSinceLastStore > this.STORAGE_QUEUE_MAX_LATENCY_MS)
    ) {
      const drainedEvents = this.storageQueue.splice(0, this.STORAGE_QUEUE_BATCH_SIZE)
      // We need to update our knowledge about causality in the world and make sure our vectorclock
      // updated to the latest state for each peer that is NOT ourselves (see publish())
      // storeEvents will save metadata
      drainedEvents
        .filter((e) => e.originator !== this.getPeerId())
        .forEach((e) => {
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

  private async storeEvents(events: DEvent[]): Promise<void> {
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
    const mappedEvents = await Promise.all(
      events
        // This is some (ugly?) special casing: we do not persist and create or update events on the ROOT node
        // performed by other peers. This is to make sure there is always only one ROOT node on each peer
        .filter(
          (e) =>
            !(
              e.type === EventType.ADD_OR_UPDATE_NODE &&
              e.nodeId === 'ROOT' &&
              e.originator !== this.peerId
            )
        )
        .map(async (e) => {
          // We preincrement the counter because our semantics are that counter is always the current
          // highest existing ID in the database
          const newId = ++this.counter
          return {
            eventid: newId,
            // the local id exists when the DEvent comes from outside but it is -1 when it originates on this client
            localId: e.localId !== -1 ? e.localId : newId,
            eventtype: e.type,
            treenodeid: e.nodeId,
            peerid: await this.peerIdMapper.externalToInternalPeerId(e.originator),
            vectorclock: await externalToInternalVectorclockValues(
              this.peerIdMapper,
              e.clock.values
            ),
            payload: e.payload,
          }
        })
    )
    await this.repository.storeEvents(mappedEvents, (e) => {
      this.garbageCollector.countEvent(e)
    })
  }

  private async loadOrCreateMetadata(): Promise<void> {
    const currentMetadata = await this.repository.loadPeerMetadata()
    if (!currentMetadata) {
      this.peerId = generateUUID()
      this.vectorClock = new VectorClock()
      // always start a new vectorclock on 1 for the current peer
      this.vectorClock.increment(this.peerId)
      await this.saveMetadata()
    } else {
      this.peerId = currentMetadata.eventlogid
      this.vectorClock = new VectorClock(currentMetadata.vectorclock)
    }
  }

  private async saveMetadata(): Promise<void> {
    this.repository.storePeerMetadata({
      eventlogid: this.peerId,
      vectorclock: this.vectorClock.values,
    })
  }

  async publish(
    type: EventType,
    nodeId: string,
    payload: EventPayloadType,
    synchronous: boolean
  ): Promise<void> {
    // We update the vectorclock for our own peer only in this location since we need a continuously up to date view
    // on the world. We increment our clock for other peer data in drainStorageQueue() where we only take into account
    // other peers. This can only happen there since that is the time where we persist the current state of the world
    // and the vectorclock should represent this.
    // However, this has a problem: if drainstorageQue happens later than the other peers will be slightly out
    // of date in our vectorclock. Not sure how to solve this.
    this.vectorClock.increment(this.peerId)
    // Locally generated events have no localId _yet_, it is filled with the current maxCounter when storing the event
    await this.insert(
      [new DEvent(-1, type, this.peerId, this.vectorClock, nodeId, payload)],
      synchronous
    )
  }

  /**
   * 1. persist the event in indexeddb
   * 2. async notify any subscribers that are interested
   *
   * @param events The events to persist and rebroadcast.
   */
  async insert(events: DEvent[], synchronous: boolean): Promise<void> {
    if (events.length === 0) {
      return
    }
    try {
      this.storageQueue.push(...events)
      if (synchronous) {
        await this.drainStorageQueue(true)
      }
    } catch (err) {
      // tslint:disable-next-line:no-console
      console.error(`ERROR occurred during nodeEvent storage: `, err)
    }
  }

  subscribe(subscriber: EventSubscriber): Subscription {
    const subscription = new EventSubscription(
      (subToCancel) =>
        (this.subscriptions = this.subscriptions.filter((sub) => sub !== subToCancel)),
      subscriber
    )
    this.subscriptions.push(subscription)
    return subscription
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

  async getEventsSince(
    peerId: string,
    fromCounterNotInclusive: number,
    batchSize: number
  ): Promise<Events> {
    if (fromCounterNotInclusive > this.counter) {
      throw new CounterTooHighError(
        `The eventlog has a counter of ${this.counter}` +
          ` but events were requested since ${fromCounterNotInclusive}`
      )
    }
    const localPeerId = await this.peerIdMapper.externalToInternalPeerId(peerId)
    const lowerBound = [localPeerId, fromCounterNotInclusive] as PeerIdAndEventIdKeyType
    const upperBound = [localPeerId, fromCounterNotInclusive + batchSize] as PeerIdAndEventIdKeyType
    const events = await this.repository.loadEventsSince(lowerBound, upperBound)
    return this.processRetrievedEvents(events)
  }

  async getAllEventsFromType(eventType: EventType): Promise<Events> {
    const storedEvents = await this.repository.loadEventsFromType(eventType)
    return this.processRetrievedEvents(storedEvents)
  }

  private processRetrievedEvents(storedEvents: StoredEvent[]): Events {
    storedEvents.sort(storedEventComparator)
    // This code is a bit of a cop out: we should not need this since this.counter is always
    // set to the highest stored event id when we insert() it into the database.
    // However we observed a counter being one off (and lower) than the real max event
    // and this causes a endless loop of claiming to have new events and pushing it to the
    // server. This is a sort of sanity check to correct the counter should it be off.
    // I have no idea why the code in insert() should not suffice.
    for (const event of storedEvents) {
      if (event.eventid > this.counter) {
        throw Error(
          `Unexpected state: local counter is not the max event id in the db, this should not happen (see insert())`
        )
      }
    }
    return {
      counter: this.counter,
      events: storedEvents.map((e) => mapStoredEventToDEvent(this.peerIdMapper, e)),
    }
  }

  async getNodeEvent(nodeId: string): Promise<DEvent> {
    const events = await this.repository.loadStoredEvents(EventType.ADD_OR_UPDATE_NODE, nodeId)
    if (events.length === 0) {
      return null
    }
    // It can happen that we get multiple events for one node, depending on whether
    // the garbage collection has already run or not for this event. So we may need
    // to do some ad hoc garbage collection here.
    if (events.length > 1) {
      events.sort(storedEventComparator)
    }
    return mapStoredEventToDEvent(this.peerIdMapper, events[events.length - 1])
  }
}

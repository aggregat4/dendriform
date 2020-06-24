import { EventType, ReorderChildNodeEventPayload, DEventLog } from './eventlog'
import { JobScheduler, FixedTimeoutStrategy } from '../utils/jobscheduler'
import { StoredEvent, storedEventComparator, EventStoreSchema } from './eventlog-storedevent'
import { IDBPDatabase } from 'idb'

class GcCandidate {
  constructor(readonly nodeId: string, readonly eventtype: EventType) {}
}

export class LocalEventLogGarbageCollector {
  private readonly GC_TIMEOUT_MS = 10000
  private readonly GC_MAX_BATCH_SIZE = 500
  private readonly MAX_SLICE_TIME = 15
  /**
   * An optimization to avoid doing gc when no changes were made: as soon as the current counter
   * is higher than the last counter we do gc, otherwise we just sleep.
   */
  private lastGcCounter = -1
  private garbageCollector: JobScheduler = new JobScheduler(new FixedTimeoutStrategy(this.GC_TIMEOUT_MS), this.gc.bind(this))
  private histogram: Map<string, number> = null

  constructor(readonly eventLog: DEventLog, readonly db: IDBPDatabase<EventStoreSchema>) {}

  start(): void {
    this.garbageCollector.start(false)
  }

  stop(): void {
    this.garbageCollector.stop()
  }

  stopAndWaitUntilDone(): Promise<void> {
    return this.garbageCollector.stopAndWaitUntilDone()
  }

  countEvent(event: StoredEvent): void {
    this.modifyEventCount(event, 1)
  }

  private modifyEventCount(event: StoredEvent, count: number): void {
    if (! this.histogram) {
      // we may not yet have a histogram, in that case just ignore this
      return
    }
    const key = this.keyForEvent(event)
    const currentCount = this.histogram.get(key) || 0
    if (count < 0 && Math.abs(count) > currentCount) {
      console.warn(`trying to decrease event counter for GC to a value that is lower (${count}) than the current count (${currentCount})`)
      this.histogram.delete(key)
    } else {
      this.histogram.set(key, currentCount + count)
    }
  }

  // TODO: would this not be a perfect use case for a webworker?
  private async gc(): Promise<any> {
    const startTime = Date.now()
    if (! this.histogram) {
      await this.createEventGcHistogram()
    }
    const afterCreateHistogramTime = Date.now()
    for (const entry of this.histogram.entries()) {
      const count = entry[1]
      if (count > 1) {
        await this.garbageCollect(this.toGcCandidate(entry[0]))
      }
      if (! this.garbageCollector.isScheduled()) {
        // if we were stopped while doing this query then make sure we abort
        return
      }
    }
    console.debug(`GC took ${Date.now() - startTime}ms, of that ${afterCreateHistogramTime - startTime}ms in histogram creation`)
  }

  private async createEventGcHistogram(): Promise<void> {
    this.histogram = new Map()
    const increment = (timestamp) => this.histogramIncrement(-1, this.MAX_SLICE_TIME)
    window.requestAnimationFrame(increment)
  }

  private async histogramIncrement(currentKey: number, maxSliceTimeInMs: number): Promise<void> {
    const t0 = window.performance.now()
    let counter = 0
    let iterateCursor = await this.db.transaction('events').store.openCursor(IDBKeyRange.lowerBound(currentKey, true))
    let lastKey = currentKey
    const currentSlice = []
    while (iterateCursor) {
      const event = iterateCursor.value
      lastKey = event.eventid
      currentSlice.push(event)
      iterateCursor = await iterateCursor.continue()
      counter += 1
      if (counter % 5 === 0) {
        const time = window.performance.now()
        if (time - t0 > maxSliceTimeInMs) {
          break
        }
      }
    }
    if (currentSlice.length === 0) {
      return
    }
    this.addToHistogram(currentSlice)
    const t1 = window.performance.now()
    // console.debug(`RAF GC Slice ${t1 - t0}ms for ${counter} events`)
    window.requestAnimationFrame((timestamp) => this.histogramIncrement(lastKey, maxSliceTimeInMs))
  }

  private addToHistogram(events: StoredEvent[]): void {
    for (const ev of events) {
      const key = this.keyForEvent(ev)
      const curVal = this.histogram.get(key)
      this.histogram.set(key, curVal ? curVal + 1 : 1)
    }
  }

  private toGcCandidate(key: string): GcCandidate {
    const firstIndexOfColon = key.indexOf(':')
    const secondIndexOfColon = key.indexOf(':', firstIndexOfColon + 1)
    return new GcCandidate(
      key.slice(0, firstIndexOfColon),
      Number(key.slice(firstIndexOfColon + 1, secondIndexOfColon)),
    )
  }

  private keyForEvent(storedEvent: StoredEvent): string {
    switch (storedEvent.eventtype) {
      case EventType.ADD_OR_UPDATE_NODE:
      case EventType.REPARENT_NODE: return `${storedEvent.treenodeid}:${storedEvent.eventtype}:`
      case EventType.REORDER_CHILD: {
        const payload = storedEvent.payload as ReorderChildNodeEventPayload
        return `${storedEvent.treenodeid}:${storedEvent.eventtype}:${payload.childId}:${payload.operation}`
      }
    }
  }

  private async garbageCollect(candidate: GcCandidate): Promise<any> {
    return this.db.getAllFromIndex('events', 'eventtype-and-treenodeid', [candidate.eventtype, candidate.nodeId])
      .then(async (nodeEvents: StoredEvent[]) => {
        // based on the eventtype we may need to partition the events for a node even further
        const arraysToPrune: StoredEvent[][] = this.groupByEventTypeDiscriminator(nodeEvents, candidate.eventtype)
        for (const pruneCandidates of arraysToPrune) {
          if (! this.garbageCollector.isScheduled()) {
            // make sure to abort processing when we have been stopped
            return
          }
          const eventsToDelete = this.findEventsToPrune(pruneCandidates)
          if (eventsToDelete.length > 0) {
            console.log(`garbageCollect: bulkdelete of `, eventsToDelete)
            const tx = this.db.transaction('events', 'readwrite')
            try {
              // This is an efficient bulk delete that does not wait for the success callback, inspired by
              // https://github.com/dfahlander/Dexie.js/blob/fb735811fd72829a44c86f82b332bf6d03c21636/src/dbcore/dbcore-indexeddb.ts#L161
              let i = 0
              let lastEvent = null
              for (; i < eventsToDelete.length; i++) {
                lastEvent = eventsToDelete[i]
                await tx.store.delete(lastEvent.eventid)
              }
              if (lastEvent) {
                this.modifyEventCount(lastEvent, - eventsToDelete.length)
              }
              return tx.done
            } catch (error) {
              console.error(`store error: `, error)
            }
          }
        }
      })
  }

  // For the child order event log we need a special garbage collection filter because
  // with logoot events for a sequence we don't just want to retain the newest event for each
  // parent, rather we need to retain the newest event for a particular child for that parent and
  // additionally take into account the operation type. We need to retain the newest DELETE as well
  // as INSERT operation so we can reliably rebuild the sequence
  private groupByEventTypeDiscriminator(nodeEvents: StoredEvent[], eventtype: EventType): StoredEvent[][] {
    switch (eventtype) {
      // no further grouping is needed for add_or_update or reparenting events
      case EventType.ADD_OR_UPDATE_NODE:
      case EventType.REPARENT_NODE: return [nodeEvents]
      // LOGOOT sequences requires more specific partitioning, we need
      // to further group by childid + operationid
      case EventType.REORDER_CHILD: {
        const reduced = nodeEvents.reduce((acc, val: StoredEvent) => {
          const payload = (val.payload as ReorderChildNodeEventPayload)
          const key = `${payload.childId}:${payload.operation}`; // semicolon necessary!
          (acc[key] = acc[key] || []).push(val)
          return acc
        }, {})
        // Object.values() is ES2017, I don't want to target
        // ES2017 with typescript yet so therefore the workaround with keys
        return Object.keys(reduced).map(key => reduced[key])
      }
    }
  }

  /**
   * Assumes that the provided stored events are all of the same logical type and that we can
   * just sort causally and remove all precursor events.
   */
  private findEventsToPrune(events: StoredEvent[]): StoredEvent[] {
    if (events.length > 1) {
      events.sort(storedEventComparator)
      // remove the last element, which is also the newest event which we want to retain
      events.splice(-1 , 1)
      return events
    } else {
      return []
    }
  }

}

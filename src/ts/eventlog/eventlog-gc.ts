import { JobScheduler, FixedTimeoutStrategy } from '../utils/jobscheduler'
import { StoredEvent, storedEventComparator } from './repository'
import { EventStorageListener, IdbEventRepository } from './idb-event-repository'
import { LifecycleAware } from '../domain/lifecycle'

class GcCandidate {
  constructor(readonly nodeId: string) {}
}

export class LocalEventLogGarbageCollector implements LifecycleAware, EventStorageListener {
  private readonly GC_TIMEOUT_MS = 10000
  private readonly GC_MAX_BATCH_SIZE = 500
  private readonly MAX_SLICE_TIME = 15
  /**
   * An optimization to avoid doing gc when no changes were made: as soon as the current counter
   * is higher than the last counter we do gc, otherwise we just sleep.
   */
  private lastGcCounter = -1
  private garbageCollector: JobScheduler = new JobScheduler(
    new FixedTimeoutStrategy(this.GC_TIMEOUT_MS),
    this.gc.bind(this)
  )
  private histogram: Map<string, number> = null

  constructor(readonly repository: IdbEventRepository) {}

  eventStored(event: StoredEvent): void {
    this.modifyEventCount(event, 1)
  }

  eventDeleted(event: StoredEvent): void {
    this.modifyEventCount(event, -1)
  }

  async init(): Promise<void> {
    await this.garbageCollector.start(false)
  }

  async deinit(): Promise<void> {
    await this.garbageCollector.stopAndWaitUntilDone()
  }

  private modifyEventCount(event: StoredEvent, count: number): void {
    if (!this.histogram) {
      // we may not yet have a histogram, in that case just ignore this
      return
    }
    const key = this.keyForEvent(event)
    const currentCount = this.histogram.get(key) || 0
    if (count < 0 && Math.abs(count) > currentCount) {
      console.warn(
        `trying to decrease event counter for GC to a value that is lower (${count}) than the current count (${currentCount})`
      )
      this.histogram.delete(key)
    } else {
      this.histogram.set(key, currentCount + count)
    }
  }

  // TODO: would this not be a perfect use case for a webworker?
  private async gc(): Promise<void> {
    const startTime = Date.now()
    if (!this.histogram) {
      this.createEventGcHistogram()
      return
    }
    for (const entry of this.histogram.entries()) {
      const count = entry[1]
      if (count > 1) {
        await this.garbageCollect(this.toGcCandidate(entry[0]))
      }
      if (!this.garbageCollector.isScheduled()) {
        // if we were stopped while doing this query then make sure we abort
        return
      }
    }
    console.debug(`GC took ${Date.now() - startTime}ms`)
  }

  private createEventGcHistogram(): void {
    const startTime = Date.now()
    this.histogram = new Map<string, number>()
    const increment = () => {
      void this.histogramIncrement(-1, this.MAX_SLICE_TIME)
      console.debug(`GC Histogram creation took ${Date.now() - startTime}ms`)
    }
    window.requestAnimationFrame(increment)
  }

  private async histogramIncrement(currentKey: number, maxSliceTimeInMs: number): Promise<void> {
    const t0 = window.performance.now()
    let counter = 0
    let lastKey = currentKey
    const currentSlice = []
    for await (const e of this.repository.eventGenerator(currentKey)) {
      lastKey = e.eventid
      currentSlice.push(e)
      counter += 1
      if (counter % 5 === 0) {
        if (window.performance.now() - t0 >= maxSliceTimeInMs) {
          break
        }
      }
    }
    this.addToHistogram(currentSlice)
    // only schedule another slice if we got any results with this run
    if (currentSlice.length !== 0) {
      window.requestAnimationFrame(() => void this.histogramIncrement(lastKey, maxSliceTimeInMs))
    }
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
    return new GcCandidate(key.slice(0, firstIndexOfColon))
  }

  private keyForEvent(storedEvent: StoredEvent): string {
    return `${storedEvent.treenodeid}:`
  }

  private async garbageCollect(candidate: GcCandidate): Promise<void> {
    const nodeEvents = await this.repository.loadEventsForNode(candidate.nodeId)
    if (!this.garbageCollector.isScheduled()) {
      // make sure to abort processing when we have been stopped
      return
    }
    const eventsToDelete = this.findEventsToPrune(nodeEvents)
    if (eventsToDelete.length > 0) {
      await this.repository.deleteEvents(eventsToDelete)
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
      events.splice(-1, 1)
      return events
    } else {
      return []
    }
  }
}

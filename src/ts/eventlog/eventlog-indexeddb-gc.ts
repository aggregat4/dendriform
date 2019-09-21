import { StoredEvent, storedEventComparator } from './eventlog-indexeddb'
import { EventType, ReorderChildNodeEventPayload, DEventLog } from './eventlog'

class GcCandidate {
  constructor(readonly nodeId: string, readonly eventtype: EventType) {}
}

export class LocalEventLogGarbageCollector {
  private readonly GC_TIMEOUT_MS = 10000
  private readonly GC_MAX_BATCH_SIZE = 500
  /**
   * An optimization to avoid doing gc when no changes were made: as soon as the current counter
   * is higher than the last counter we do gc, otherwise we just sleep.
   */
  private lastGcCounter = -1

  constructor(readonly eventLog: DEventLog, readonly eventLogTable: any) {}

  start(): void {
    //window.setTimeout(this.gc.bind(this), this.GC_TIMEOUT_MS)
  }

  // TODO: would this not be a perfect use case for a webworker?
  private async gc(): Promise<any> {
    if (this.lastGcCounter < this.eventLog.getCounter()) {
      const gcCandidates = await this.findGcCandidates()
      const gcBatch = gcCandidates.splice(0, this.GC_MAX_BATCH_SIZE)
      for (const candidate of gcBatch) {
        await this.garbageCollect(candidate)
      }
      // if we were able to gc all candidates this round, set our counter variable to the current counter
      // this allows us to skip gc when there is nothing to do
      if (gcBatch.length === gcCandidates.length) {
        this.lastGcCounter = this.eventLog.getCounter()
      }
    }
    window.setTimeout(this.gc.bind(this), this.GC_TIMEOUT_MS)
  }

  /**
   * Goes through all stored events and counts how many events exist for a specific discriminator.
   * A discriminator is typically nodeid+eventtype but some events may require a more specific
   * discriminator.
   * For all descriminators that occur more than once we have a garbage collection candidate and
   * we just store the candidate in our list.
   * TODO: not implement this with strings? Or is this the best choice since it is pragmatic?
   */
  private async findGcCandidates(): Promise<GcCandidate[]> {
    const startOfGcFind = Date.now()
    const eventCounter = {}
    const gcCandidates = []
    // toArray() seems to be significantly (10x?) faster than .each() but
    // it does load everything in memory, is this ok?
    return this.eventLogTable.toArray().then(events => {
      for (const ev of events) {
        const key = this.keyForEvent(ev)
        eventCounter[key] = eventCounter[key] ? eventCounter[key] + 1 : 1
      }
    })
    .then(() => {
      const buildCounterTime = Date.now()
      for (const key of Object.keys(eventCounter)) {
        if (eventCounter[key] > 1) {
          const firstIndexOfColon = key.indexOf(':')
          const secondIndexOfColon = key.indexOf(':', firstIndexOfColon + 1)
          gcCandidates.push(
            new GcCandidate(
              key.slice(0, firstIndexOfColon),
              Number(key.slice(firstIndexOfColon + 1, secondIndexOfColon)),
            ),
          )
        }
      }
      // TODO: move this into a generic metrics thing
      console.debug(`Determined GC candidates in ${Date.now() - startOfGcFind}ms, about ${buildCounterTime - startOfGcFind}ms was needed to build the map`)
      return gcCandidates
    })
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

  private garbageCollect(candidate: GcCandidate): Promise<any> {
    return this.eventLogTable.where('[eventtype+treenodeid]').equals([candidate.eventtype, candidate.nodeId]).toArray()
      .then((nodeEvents: StoredEvent[]) => {
        // based on the eventtype we may need to partition the events for a node even further
        const arraysToPrune: StoredEvent[][] = this.groupByEventTypeDiscriminator(nodeEvents, candidate.eventtype)
        for (const pruneCandidates of arraysToPrune) {
          const eventsToDelete = this.findEventsToPrune(pruneCandidates)
          if (eventsToDelete.length > 0) {
            // console.log(`garbageCollect: bulkdelete of `, eventsToDelete)
            return this.eventLogTable.bulkDelete(eventsToDelete.map((e) => e.eventid))
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

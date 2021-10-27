import { DEventLog, Events } from '../eventlog/eventlog-domain'
import { RemoteEventLog } from './eventlog-remote'
import { JobScheduler, BackoffWithJitterTimeoutStrategy } from '../utils/jobscheduler'
import { IDBPDatabase, DBSchema, openDB } from 'idb'
import { assert } from '../utils/util'
import { LifecycleAware } from '../domain/lifecycle'

/**
 * We store the max localeventid that we know per originator. This allows us to
 * check whether a server may have newer events than us or whether we need to
 * send the server newer events.
 */
interface EventPumpMetadata {
  originator: string
  maxlocaleventid: number
}

interface EventPumpSchema extends DBSchema {
  metadata: {
    key: string
    value: EventPumpMetadata
  }
}

/**
 * An event pump connects an event log to a remote server and a local event log
 * and pumps events back and forth continuously.
 *
 * The pump knows for what events it is authoratative, this means what events it
 * should be sending to the server. All originatorIds that it is _not_ authoratative
 * for will be fetched from the server.
 *
 * In each pump loop iteration the following happens:
 * - We ask the server what originatorIds it knows and what the max local event Ids
 *   are that it has.
 * - For the originatorId that the client is authoratative we will send maximum one
 *   page of new events.
 * - For all other originatorIds it requests at most one page worth of new events.
 *
 * If both the client and the server do not generate any further events this means
 * that eventually the client will have nothing to do anymore.
 */
export class EventPump implements LifecycleAware {
  private db: IDBPDatabase<EventPumpSchema>
  private readonly dbName: string
  private readonly DEFAULT_DELAY_MS = 5000
  private readonly MAX_DELAY_MS = 60 * 1000
  private readonly EVENT_TRANSMISSION_BATCH_SIZE = 250

  private eventPump = new JobScheduler(
    new BackoffWithJitterTimeoutStrategy(this.DEFAULT_DELAY_MS, this.MAX_DELAY_MS),
    this.pump.bind(this)
  )

  // A map of originator Ids to the largest local event Id we know for that originator
  private maxLocalEventIds = new Map<string, number>()

  constructor(
    private readonly localEventLog: DEventLog,
    private readonly remoteEventLog: RemoteEventLog,
    // The originatorId we are authoratative for
    private readonly authoratativeFor: string
  ) {
    this.dbName = localEventLog.getName() + '-eventpump'
  }

  async init(): Promise<void> {
    this.db = await openDB<EventPumpSchema>(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore('metadata', {
          keyPath: 'id',
          autoIncrement: false,
        })
      },
    })
    await this.loadOrCreateMetadata()
    await this.eventPump.start(true)
  }

  async deinit(): Promise<void> {
    if (this.db) {
      await this.eventPump.stopAndWaitUntilDone()
      await this.saveMetadata()
      this.db.close()
      this.db = null
    }
  }

  private async loadOrCreateMetadata(): Promise<void> {
    const metadata = await this.db.getAll('metadata')
    if (metadata) {
      for (const maxLocalEventId of metadata) {
        this.maxLocalEventIds.set(maxLocalEventId.originator, maxLocalEventId.maxlocaleventid)
      }
    }
  }

  private async saveMetadata(): Promise<void> {
    try {
      for (const [originator, maxlocaleventid] of this.maxLocalEventIds.entries()) {
        await this.db.put('metadata', { originator, maxlocaleventid })
      }
    } catch (error) {
      throw Error(`Error saving metadata`)
    }
  }

  /**
   * client asks server for his current state of the world
   * if he doesn't know our max event Id yet, send a batch of local events
   * for all other originator ids:
   *   if we do not know the max id yet, fetch a batch of remote events
   */
  private async pump(): Promise<void> {
    const serverState = await this.remoteEventLog.fetchServerState()
    const serverMaxKnownEventIdForOwnEvents = serverState[this.authoratativeFor] || -1
    if (serverMaxKnownEventIdForOwnEvents < this.maxLocalEventIds.get(this.authoratativeFor)) {
      await this.drainLocalEvents(serverMaxKnownEventIdForOwnEvents)
    }
    for (const originatorId of Object.keys(serverState)) {
      if (originatorId === this.authoratativeFor) {
        continue
      }
      const serverMaxId = serverState[originatorId]
      const localMaxKnownEventId = this.maxLocalEventIds.get(originatorId) || -1
      assert(
        localMaxKnownEventId <= serverMaxId,
        `We can not have more events than the server for an eventlog that we are not authoratative for. Offending originator: ${originatorId}`
      )
      if (localMaxKnownEventId < serverMaxId) {
        await this.fetchRemoteEvents(localMaxKnownEventId, originatorId)
      }
    }
  }

  /**
   * Gets all the events since maxLocalCounter, sends them to the server and
   * when successfull, saves the new maxLocalCounter.
   * @throws something on server contact failure
   */
  private async drainLocalEvents(maxServerEventId: number): Promise<void> {
    const events: Events = await this.localEventLog.getEventsSince(
      this.localEventLog.getPeerId(),
      maxServerEventId,
      this.EVENT_TRANSMISSION_BATCH_SIZE
    )
    if (events.events.length > 0) {
      await this.remoteEventLog.publishEvents(events.events)
      this.maxLocalEventIds[this.authoratativeFor] = events.counter
      await this.saveMetadata()
    }
  }

  /**
   * Gets all the events since maxServerCounter from the server, stores them
   * locally and when successfull saves the new maxServerCounter.
   * @throws something on server contact failure
   */
  private async fetchRemoteEvents(maxLocalEventId: number, originator: string): Promise<void> {
    const events = await this.remoteEventLog.getEventsSince(
      maxLocalEventId,
      originator,
      this.EVENT_TRANSMISSION_BATCH_SIZE
    )
    if (events.events.length > 0) {
      // This can be async, the client should see the changes eventually
      await this.localEventLog.insert(events.events, false)
      this.maxLocalEventIds[originator] = events.counter
      await this.saveMetadata()
    }
  }
}

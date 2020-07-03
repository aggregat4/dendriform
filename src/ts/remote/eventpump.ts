import { DEventLog, Events } from '../eventlog/eventlog'
import { RemoteEventLog } from './eventlog-remote'
import { LifecycleAware } from '../domain/domain'
import { JobScheduler, BackoffWithJitterTimeoutStrategy } from '../utils/jobscheduler'
import { IDBPDatabase, DBSchema, openDB } from 'idb'

interface EventPumpMetadata {
  id: string
  maxlocalcounter: number
  maxservercounter: number
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
 * It filters incoming events to be only those that are NOT
 * originated by the eventlog itself by using the event log's peerid as a filter.
 *
 * It filters outgoing events to be only events from the local peer.
 *
 * It keeps track of the max event counter it has seen from the server for this
 * eventlog (identified by name) so far. It does the same for the local event log.
 *
 * implNote: We can't easily subscribe for local events and persist them when they
 * occur because we also need to make sure that we persisted all previous events.
 * If we would get all local events to persist, save them on the server and then
 * subscribe, we would need to make sure that we didn't miss any events between
 * the fetch of all local events and the start of our subscription. That seems too
 * hard for now. Instead this implementation polls the client and it polls the server.
 */
export class EventPump implements LifecycleAware {
  private db: IDBPDatabase<EventPumpSchema>
  private readonly dbName: string
  private readonly DEFAULT_DELAY_MS = 5000
  private readonly MAX_DELAY_MS = 60 * 1000
  private readonly EVENT_TRANSMISSION_BATCH_SIZE = 250

  private localEventPump = new JobScheduler(
    new BackoffWithJitterTimeoutStrategy(this.DEFAULT_DELAY_MS, this.MAX_DELAY_MS),
    this.drainLocalEvents.bind(this)
  )
  private remoteEventPump = new JobScheduler(
    new BackoffWithJitterTimeoutStrategy(this.DEFAULT_DELAY_MS, this.MAX_DELAY_MS),
    this.drainRemoteEvents.bind(this)
  )

  private maxServerCounter: number
  /**
   * This is the counter of the last locally originated event that the server has seen.
   * We use it to determine what to send the server. Should the server reset its state
   * in some way we may need to correct this number.
   */
  private maxLocalCounter: number

  constructor(
    private readonly localEventLog: DEventLog,
    private readonly remoteEventLog: RemoteEventLog
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
    await this.localEventPump.start(true)
    await this.remoteEventPump.start(true)
  }

  async deinit(): Promise<void> {
    if (this.db) {
      await this.localEventPump.stopAndWaitUntilDone()
      await this.remoteEventPump.stopAndWaitUntilDone()
      await this.saveMetadata()
      this.db.close()
      this.db = null
    }
  }

  private async loadOrCreateMetadata(): Promise<void> {
    const metadata = await this.db.getAll('metadata')
    if (!metadata || metadata.length === 0) {
      this.maxServerCounter = -1
      this.maxLocalCounter = -1
      await this.saveMetadata()
    } else {
      const md = metadata[0]
      this.maxServerCounter = md.maxservercounter
      this.maxLocalCounter = md.maxlocalcounter
    }
  }

  private async saveMetadata(): Promise<void> {
    const metadata = {
      id: this.dbName,
      maxservercounter: this.maxServerCounter,
      maxlocalcounter: this.maxLocalCounter,
    }
    try {
      await this.db.put('metadata', metadata)
    } catch (error) {
      throw Error(`Error saving metadata`)
    }
  }

  /**
   * Gets all the events since maxLocalCounter, sends them to the server and
   * when successfull, saves the new maxLocalCounter.
   * @throws something on server contact failure
   */
  private async drainLocalEvents(): Promise<void> {
    const events: Events = await this.localEventLog.getEventsSince(
      this.localEventLog.getPeerId(),
      this.maxLocalCounter,
      this.EVENT_TRANSMISSION_BATCH_SIZE
    )
    if (events.events.length > 0) {
      await this.remoteEventLog.publishEvents(events.events)
      this.maxLocalCounter = events.counter
      await this.saveMetadata()
    }
  }

  /**
   * Gets all the events since maxServerCounter from the server, stores them
   * locally and when successfull saves the new maxServerCounter.
   * @throws something on server contact failure
   */
  private async drainRemoteEvents(): Promise<void> {
    const events = await this.remoteEventLog.getEventsSince(
      this.maxServerCounter,
      this.localEventLog.getPeerId(),
      this.EVENT_TRANSMISSION_BATCH_SIZE
    )
    if (events.events.length > 0) {
      // This can be async, the client should see the changes eventually
      await this.localEventLog.insert(events.events, false)
      this.maxServerCounter = events.counter
      await this.saveMetadata()
    }
  }
}

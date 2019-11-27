import { DEventLog, Events } from '../eventlog/eventlog'
// Import without braces needed to make sure it exists under that name!
import Dexie from 'dexie'
import { RemoteEventLog } from './eventlog-remote'

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
export class EventPump {

  private db: Dexie
  private readonly dbName: string

  private initialised = false
  private localEventPump = new Pump(5000)
  private remoteEventPump = new Pump(5000)

  private maxServerCounter: number
  /**
   * This is the counter of the last locally originated event that the server has seen.
   * We use it to determine what to send the server. Should the server reset its state
   * in some way we may need to correct this number.
   */
  private maxLocalCounter: number

  constructor(private readonly localEventLog: DEventLog,
              private readonly remoteEventLog: RemoteEventLog) {
    this.dbName = localEventLog.getName() + '-eventpump'
  }

  async init(): Promise<any> {
    this.db = new Dexie(this.dbName)
    this.db.version(1).stores({
      metadata: 'id', // columns: id, maxlocalcounter, maxservercounter (the id is synthetic, we just need it to identify the rows)
    })
    await this.db.open()
    await this.loadOrCreateMetadata()
    this.initialised = true
    this.localEventPump.schedule(`drainLocalEvents-${this.dbName}`, this.drainLocalEvents.bind(this))
    this.remoteEventPump.schedule(`drainRemoteEvents-${this.dbName}`, this.drainRemoteEvents.bind(this))
    return this
  }

  async deinit(): Promise<void> {
    if (this.db) {
      await this.saveMetadata()
      await this.db.close()
      this.db = null
    }
  }

  private async loadOrCreateMetadata(): Promise<void> {
    const metadata = await this.db.table('metadata').toArray()
    if (!metadata || metadata.length === 0) {
      this.maxServerCounter = -1
      this.maxLocalCounter = -1
      return this.saveMetadata()
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
      return this.db.table('metadata').put(metadata)
    } catch (error) {
      throw Error(`Error saving metadata: ${error}`)
    }
  }

  start() {
    if (! this.initialised) {
      throw Error('EventPump was not initialised, can not start')
    }
    this.localEventPump.start()
    this.remoteEventPump.start()
  }

  stop() {
    this.localEventPump.stop()
    this.remoteEventPump.stop()
  }

  hasTriedToContactServerOnce(): boolean {
    return this.remoteEventPump.isScheduledFunctionExecuted()
  }

  /**
   * Gets all the events since maxLocalCounter, sends them to the server and
   * when successfull, saves the new maxLocalCounter.
   * @throws something on server contact failure
   */
  private async drainLocalEvents(): Promise<any> {
    const events: Events = await this.localEventLog.getAllEventsSince(this.localEventLog.getPeerId(), this.maxLocalCounter)
    if (events.events.length > 0) {
      await this.remoteEventLog.publishEvents(events.events)
      this.maxLocalCounter = events.counter
      return this.saveMetadata()
    } else {
      return Promise.resolve()
    }
  }

  /**
   * Gets all the events since maxServerCounter from the server, stores them
   * locally and when successfull saves the new maxServerCounter.
   * @throws something on server contact failure
   */
  private async drainRemoteEvents(): Promise<any> {
    const events = await this.remoteEventLog.getAllEventsSince(this.maxServerCounter, this.localEventLog.getPeerId())
    if (events.events.length > 0) {
      // This can be async, the client should see the changes eventually
      await this.localEventLog.insert(events.events, false)
      this.maxServerCounter = events.counter
      return this.saveMetadata()
    } else {
      return Promise.resolve()
    }
  }

}

class Pump {
  private pumping = false
  private retryDelayMs: number
  // when not actually pumping we want to be able to react to changes in our state quickly so we set a low delay in that case
  private readonly INACTIVE_DELAY = 50
  // One minute is the maximum delay we want to have in case of backoff
  private readonly MAX_DELAY_MS = 60 * 1000

  private scheduledFunctionExecuted: boolean = false

  constructor(private readonly defaultDelayInMs: number) {}

  start() {
    this.pumping = true
  }

  async schedule(name: string, fun: () => Promise<any>) {
    try {
      if (this.pumping) {
        await fun()
        this.scheduledFunctionExecuted = true
        // we successfully executed the function, so we can reset the retry delay to the default
        this.retryDelayMs = this.defaultDelayInMs
        console.debug(`Successful server request, resetting backoff delay to default for ${name}`)
      }
    } catch (e) {
      this.scheduledFunctionExecuted = true
      // when we fail do some backoff and retry later
      if (this.retryDelayMs < this.MAX_DELAY_MS) {
        this.retryDelayMs = this.calcBackoffTimeout(this.retryDelayMs)
      } else {
        this.retryDelayMs = this.MAX_DELAY_MS
      }
      console.debug(`Performing backoff because server not reached, delaying for ${this.retryDelayMs}ms for ${name}`)
    }
    // schedule the next drain
    const delay = this.pumping ? this.retryDelayMs : this.INACTIVE_DELAY
    window.setTimeout(() => this.schedule(name, fun), delay)
  }

  /**
   * This function calculates the new timeout by doing exponential backoff and by
   * applying some random jitter (somewhere between 0 and 1 second).
   *
   * @param currentTimeoutMs The current timeout in milliseconds.
   * @returns The new timeout in milliseconds.
   */
  private calcBackoffTimeout(currentTimeoutMs: number): number {
    return (currentTimeoutMs * 2) + (1000 * Math.random())
  }

  stop() {
    this.pumping = false
  }

  isScheduledFunctionExecuted(): boolean {
    return this.scheduledFunctionExecuted
  }
}

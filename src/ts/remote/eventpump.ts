import { DEventLog, DEvent, Events } from '../eventlog/eventlog'
// Import without braces needed to make sure it exists under that name!
import Dexie from 'dexie'
import { RemoteEventLog } from './eventlog-remote'

/**
 * An event pump connects an event log to a remote server and a local event log
 * and pumpts events back and forth continuosly.
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
export class EventPump<T> {

  private readonly db
  private readonly dbName

  private initialised = false
  private pump = new Pump(1000)

  private maxServerCounter: number
  private maxLocalCounter: number

  constructor(private readonly localEventLog: DEventLog<T>,
              private readonly remoteEventLog: RemoteEventLog<T>) {
    this.dbName = localEventLog.getName() + '-eventpump'
    this.db = new Dexie(this.dbName)
  }

  init(): Promise<void> {
    this.db.version(1).stores({
      metadata: 'id', // columns: id, maxlocalcounter, maxservercounter (the id is synthetic, we just need it to identify the rows)
    })
    return this.db.open()
      .then(() => this.loadOrCreateMetadata())
      .then(() => { this.initialised = true })
      .then(() => {
        this.pump.schedule(this.drainLocalEvents)
        this.pump.schedule(this.drainRemoteEvents)
      })
      .then(() => this)
  }

  private loadOrCreateMetadata(): Promise<void> {
    return this.db.table('metadata').toArray().then(metadata => {
      if (!metadata || metadata.length === 0) {
        this.maxServerCounter = -1
        this.maxLocalCounter = -1
        return this.saveMetadata()
      } else {
        const md = metadata[0]
        this.maxServerCounter = md.maxservercounter
        this.maxLocalCounter = md.maxlocalcounter
      }
    })
  }

  private saveMetadata(): Promise<void> {
    const metadata = {
      id: this.dbName,
      maxservercounter: this.maxServerCounter,
      maxlocalcounter: this.maxLocalCounter,
    }
    return this.db.table('metadata').put(metadata)
      .catch(error => console.error(`saveMetadata error: `, error))
  }

  start() {
    if (! this.initialised) {
      throw Error('EventPump was not initialised, can not start')
    }
    this.pump.start()
  }

  stop() {
    this.pump.stop()
  }

  /**
   * Gets all the events since maxLocalCounter, sends them to the server and
   * when successfull, saves the new maxLocalCounter.
   * @throws something on server contact failure
   */
  private async drainLocalEvents(): Promise<any> {
    const events: Events<T> = await this.localEventLog.getEventsSince(this.maxLocalCounter, this.localEventLog.getPeerId())
    await this.remoteEventLog.publishEvents(events.events)
    this.maxLocalCounter = events.counter
    return this.saveMetadata()
  }

  /**
   * Gets all the events since maxServerCounter from the server, stores them
   * locally and when successfull saves the new maxServerCounter.
   * @throws something on server contact failure
   */
  private async drainRemoteEvents(): Promise<any> {
    const events = await this.remoteEventLog.getEventsSince(this.maxServerCounter, this.localEventLog.getPeerId())
    await this.localEventLog.insert(events.events)
    this.maxServerCounter = events.counter
    return this.saveMetadata()
  }

}

class Pump {
  private pumping = false
  private retryDelayMs: number

  constructor(private readonly defaultDelayInMs: number) {}

  start() {
    this.pumping = true
  }

  async schedule(fun: () => Promise<any>) {
    try {
      if (this.pumping) {
        await fun()
        // we successfully contacted the server, so we can reset the retry delay to the default
        this.retryDelayMs = this.defaultDelayInMs
      }
    } catch (e) {
      // when we fail to contact the server do some backoff and retry later
      this.retryDelayMs = this.retryDelayMs * 2
    }
    // schedule the next drain
    window.setTimeout(() => this.schedule(fun), this.retryDelayMs)
  }

  stop() {
    this.pumping = false
  }
}

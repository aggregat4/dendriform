import { DEventLog } from './eventlog'
import Dexie from 'dexie'

/**
 * An event pump connects an event log to a remote server and pumpts events back and
 * forth continuosly.
 *
 * It filters incoming events to be only those that are NOT
 * originated by the eventlog itself by using the event log's peerid as a filter.
 *
 * It keeps track of the max event counter it has seen from the server for this
 * eventlog (identified by name) so far.
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
  private pumping = false
  private maxServerCounter: number
  private maxLocalCounter: number

  constructor(private readonly localEventLog: DEventLog<T>, private readonly serverEndpoint: string) {
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
    this.pumping = true
    // start polling the local log and storing to server
    // start polling the server and inserting in the local log

    // TODO: we can't use setInterval, we async fetch events and don't know when that returns,
    // we need to start a fetch and on resolving the result start another one, unless not running
  }

  // Queries for new events since this.maxServerCounter from server and feeds them to the localEventLog
  private pumpRemoteEvents(): Promise<void> {
    // TODO: use fetch to query remote server
  }

  // Queries for new events locally since this.maxLocalCounter and feeds them to the server using fetch
  private pumpLocalEvents(): Promise<void> {

  }

  stop() {
    // stop polling
    this.pumping = false
  }

}

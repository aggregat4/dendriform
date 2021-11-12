import { openDB, IDBPDatabase, DBSchema } from 'idb'
import { LifecycleAware } from '../domain/lifecycle'
import { LogMoveRecord, PeerMetadata, StoredEvent } from '../eventlog/repository'

export type PeerIdAndEventIdKeyType = [number, number]

export type ClockAndPeerIdKeyType = [number, number]

interface LogMoveSchema extends DBSchema {
  events: {
    key: number
    value: LogMoveRecord
    indexes: {
      eventid: number
      nodeid: string
      'localpeerid-and-eventid': PeerIdAndEventIdKeyType
      'clock-and-localpeerid': ClockAndPeerIdKeyType
    }
  }
}

export interface EventStorageListener {
  eventStored(event: StoredEvent): void
  eventDeleted(event: StoredEvent): void
}

export class IdbLogMoveStorage implements LifecycleAware {
  private db: IDBPDatabase<LogMoveSchema>
  private listeners: EventStorageListener[] = []

  constructor(readonly dbName: string) {}

  async init(): Promise<void> {
    this.db = await openDB<LogMoveSchema>(this.dbName, 1, {
      upgrade(db) {
        const eventsStore = db.createObjectStore('events', {
          keyPath: 'eventid',
          autoIncrement: false, // we generate our own keys, this is required since compound indexes with an auto-incremented key do not work everywhere (yet)
        })
        eventsStore.createIndex('eventid', 'eventid')
        eventsStore.createIndex('nodeid', 'nodeid')
        eventsStore.createIndex('localpeerid-and-eventid', ['localid', 'eventid'])
        eventsStore.createIndex('clock-and-localpeerid', ['clock', 'localid'])
      },
    })
  }

  async deinit(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  addListener(listener: EventStorageListener): void {
    this.listeners.push(listener)
  }

  removeListener(listener: EventStorageListener): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  private notifyListeners(callback: (EventStorageListener) => void) {
    for (const listener of this.listeners) {
      callback(listener)
    }
  }

  getName(): string {
    return this.dbName
  }

  async storeEvents(events: StoredEvent[]): Promise<void> {
    const tx = this.db.transaction('events', 'readwrite')
    try {
      // This is an efficient bulk add that does not wait for the success callback, inspired by
      // https://github.com/dfahlander/Dexie.js/blob/fb735811fd72829a44c86f82b332bf6d03c21636/src/dbcore/dbcore-indexeddb.ts#L161
      let i = 0
      for (; i < events.length; i++) {
        // we only need to wait for onsuccess if we are interested in generated keys, and we are not since they are pregenerated
        await tx.store.add(events[i])
        this.notifyListeners((listener: EventStorageListener) => listener.eventStored(events[i]))
      }
      return tx.done
    } catch (error) {
      console.error(`store error: `, error)
    }
  }

  async deleteEvents(events: StoredEvent[]): Promise<void> {
    const tx = this.db.transaction('events', 'readwrite')
    try {
      // This is an efficient bulk delete that does not wait for the success callback, inspired by
      // https://github.com/dfahlander/Dexie.js/blob/fb735811fd72829a44c86f82b332bf6d03c21636/src/dbcore/dbcore-indexeddb.ts#L161
      let i = 0
      for (; i < events.length; i++) {
        await tx.store.delete(events[i].eventid)
        this.notifyListeners((listener: EventStorageListener) => listener.eventDeleted(events[i]))
      }
      return tx.done
    } catch (error) {
      console.error(`store error: `, error)
    }
  }

  async getMaxEventId(): Promise<number> {
    const tx = this.db.transaction('events', 'readonly')
    const cursor = await tx.store.index('eventid').openCursor(null, 'prev')
    if (cursor) {
      return cursor.value.eventid
    } else {
      return -1
    }
  }

  async loadEventsSince(lowerBound: PeerIdAndEventIdKeyType, upperBound: PeerIdAndEventIdKeyType) {
    const range = IDBKeyRange.bound(lowerBound, upperBound, true, true) // do not include lower and upper bounds themselves (open interval)
    return await this.db.getAllFromIndex('events', 'localpeerid-and-eventid', range)
  }

  async loadAllEvents(): Promise<StoredEvent[]> {
    return await this.db.getAll('events')
  }

  async loadEventsForNode(nodeId: string): Promise<StoredEvent[]> {
    return await this.db.getAllFromIndex('events', 'nodeid', nodeId)
  }

  // assuming that the type parameters for an AsyncGenerator are:
  // 1. return type for next()
  // 2. return type of the function itself
  // 3. the parameter to the function
  // It is not properly documented
  async *eventGenerator(startKey: number): AsyncGenerator<StoredEvent, void, void> {
    let iterateCursor = await this.db
      .transaction('events')
      .store.openCursor(IDBKeyRange.lowerBound(startKey, true))
    while (iterateCursor) {
      yield iterateCursor.value
      iterateCursor = await iterateCursor.continue()
    }
  }
}

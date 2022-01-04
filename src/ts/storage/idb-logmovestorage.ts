import { openDB, IDBPDatabase, DBSchema } from 'idb'
import { LifecycleAware } from '../domain/lifecycle'
import { NodeMetadata } from '../eventlog/eventlog-domain'

/**
 * A representation of all the log moves that we need to persist to allow
 * for processing new incoming events. This table will be garbage collected
 * once we can identify at what clock we are causally stable.
 */
export interface LogMoveRecord {
  clock: number
  replicaId: string
  oldParentId: string
  oldPayload: NodeMetadata
  newParentId: string
  newPayload: NodeMetadata
  childId: string
}

export type PeerIdAndEventIdKeyType = [number, number]

export type ClockAndPeerIdKeyType = [number, number]

interface LogMoveSchema extends DBSchema {
  logmoveops: {
    key: [number, string]
    value: LogMoveRecord
    indexes: {
      nodeid: string
    }
  }
}

export interface EventStorageListener {
  eventStored(event: LogMoveRecord): void
  eventDeleted(event: LogMoveRecord): void
}

export class IdbLogMoveStorage implements LifecycleAware {
  private db: IDBPDatabase<LogMoveSchema>
  private listeners: EventStorageListener[] = []

  constructor(readonly dbName: string) {}

  async init(): Promise<void> {
    this.db = await openDB<LogMoveSchema>(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore('logmoveops', {
          keyPath: ['clock', 'replicaId'],
          autoIncrement: false, // we generate our own keys, this is required since compound indexes with an auto-incremented key do not work everywhere (yet)
        })
        // eventsStore.createIndex('nodeid', 'nodeid')
        // eventsStore.createIndex('clock-and-localpeerid', ['clock', 'localid'])
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

  async storeEvents(events: LogMoveRecord[]): Promise<void> {
    const tx = this.db.transaction('logmoveops', 'readwrite')
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
      console.error(`store error: `, JSON.stringify(error))
    }
  }

  async deleteAllNewerLogmoveRecordsInReverse(
    clock: number,
    replicaId: string,
    callback: (logmoveop: LogMoveRecord) => void
  ): Promise<void> {
    let cursor = await this.db
      .transaction('logmoveops', 'readwrite')
      // iterate over the logmoverecords in reverse, newest logmoveop first
      .store.openCursor(null, 'prev')
    while (cursor) {
      const currentRecord = cursor.value
      // This is our total ordering operator on logmoverecords
      if (
        currentRecord.clock > clock ||
        (currentRecord.clock == clock && currentRecord.replicaId > replicaId)
      ) {
        callback(currentRecord)
        cursor.delete()
        cursor = await cursor.continue()
      } else {
        return
      }
    }
  }
}

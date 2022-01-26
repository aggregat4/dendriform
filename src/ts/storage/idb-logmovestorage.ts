import { openDB, IDBPDatabase, DBSchema } from 'idb'
import { LifecycleAware } from '../domain/lifecycle'
import { NodeMetadata } from './nodestorage'

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
  /**
   * We need to store all lovemoverecords regardless of whether we applied them or not.
   * We may decline to apply an event if perhaps its parent is not yet known at this time
   * because the parent creation event has not arrived yet. When we undo the logmoverecords
   * we need to be able to determine whether or not this event was applied.
   */
  applied: boolean
}

interface LogMoveSchema extends DBSchema {
  logmoveops: {
    key: [number, string]
    value: LogMoveRecord
    indexes: {
      'ops-for-replica': [string, number]
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
  private clock = -1

  constructor(readonly dbName: string) {}

  async init(): Promise<void> {
    this.db = await openDB<LogMoveSchema>(this.dbName, 1, {
      upgrade(db) {
        const logmoveStore = db.createObjectStore('logmoveops', {
          keyPath: ['clock', 'replicaId'],
          autoIncrement: false, // we generate our own keys, this is required since compound indexes with an auto-incremented key do not work everywhere (yet)
        })
        logmoveStore.createIndex('ops-for-replica', ['replicaId', 'clock'])
      },
    })
    const maxClock = await this.getMaxClock()
    this.clock = maxClock + 1
  }

  async deinit(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  getAndIncrementClock(): number {
    const clock = this.clock
    this.clock++
    return clock
  }

  updateWithExternalClock(externalClock: number): void {
    if (externalClock > this.clock) {
      this.clock = externalClock + 1
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

  async storeEvents(logMoveRecords: LogMoveRecord[]): Promise<void> {
    // const existingEvents = await this.getEventsForReplicaSince(logMoveRecords[0].replicaId, 0, 100)
    // console.debug(`Current events before storing new events: ${JSON.stringify(existingEvents)}`)
    const tx = this.db.transaction('logmoveops', 'readwrite')
    try {
      // This is an efficient bulk add that does not wait for the success callback, inspired by
      // https://github.com/dfahlander/Dexie.js/blob/fb735811fd72829a44c86f82b332bf6d03c21636/src/dbcore/dbcore-indexeddb.ts#L161
      for (const logMoveRecord of logMoveRecords) {
        // we only need to wait for onsuccess if we are interested in generated keys, and we are not since they are pregenerated
        await tx.store.add(logMoveRecord)
        // TODO: this needs to be move to an async op at this point the events are not stored yet
        this.notifyListeners((listener: EventStorageListener) =>
          listener.eventStored(logMoveRecord)
        )
      }
      await tx.done
      console.log(`store success for logMoveRecords ${JSON.stringify(logMoveRecords)}`)
    } catch (error) {
      console.error(
        `store error for logMoveRecords ${JSON.stringify(logMoveRecords)}: `,
        JSON.stringify(error),
        error
      )
      throw error
    }
  }

  async updateEvent(logMoveRecord: LogMoveRecord): Promise<void> {
    await this.db.put('logmoveops', logMoveRecord)
  }

  async undoAllNewerLogmoveRecordsInReverse(
    clock: number,
    replicaId: string
  ): Promise<LogMoveRecord[]> {
    const deletedLogMoveRecords = []
    const tx = this.db.transaction('logmoveops', 'readwrite')
    // iterate over the logmoverecords in reverse, newest logmoveop first
    let cursor = await tx.store.openCursor(null, 'prev')
    while (cursor) {
      const currentRecord = cursor.value
      // This is our total ordering operator on logmoverecords
      if (
        currentRecord.clock > clock ||
        (currentRecord.clock == clock && currentRecord.replicaId > replicaId)
      ) {
        await cursor.delete()
        cursor = await cursor.continue()
        deletedLogMoveRecords.push(deletedLogMoveRecords)
      } else {
        break
      }
    }
    await tx.done
    return Promise.resolve(deletedLogMoveRecords)
  }

  private async getMaxClock(): Promise<number> {
    const cursor = await this.db
      .transaction('logmoveops', 'readonly')
      .store.openCursor(null, 'prev')
    if (cursor) {
      return cursor.value.clock
    } else {
      return 0
    }
  }

  async getEventsForReplicaSince(
    replicaId: string,
    clock: number,
    batchSize: number
  ): Promise<LogMoveRecord[]> {
    const range = IDBKeyRange.bound([replicaId, clock], [replicaId, Number.MAX_VALUE], true, true) // do not include lower bound
    return await this.db.getAllFromIndex('logmoveops', 'ops-for-replica', range, batchSize)
  }
}

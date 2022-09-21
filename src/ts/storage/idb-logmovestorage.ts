import { DBSchema, IDBPDatabase, openDB } from 'idb'
import { LifecycleAware } from '../domain/lifecycle'
import { NodeMetadata, Replica } from '../moveoperation/moveoperation-types'
import { JoinProtocol } from '../replicaset/join-protocol'
import { assert } from '../utils/util'

/**
 * A representation of all the log moves that we need to persist to allow for
 * processing new incoming events. This table will be garbage collected once we
 * can identify at what clock we are causally stable.
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
   * We need to store all lovemoverecords regardless of whether we applied them
   * or not. We may decline to apply an event if perhaps its parent is not yet
   * known at this time because the parent creation event has not arrived yet.
   * When we undo the logmoverecords we need to be able to determine whether or
   * not this event was applied.
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
  #db: IDBPDatabase<LogMoveSchema>
  #listeners: EventStorageListener[] = []
  #clock = -1
  #knownReplicaSet: { [key: string]: number } = {}

  constructor(readonly dbName: string, readonly joinProtocol: JoinProtocol) {}

  async init(): Promise<void> {
    this.#db = await openDB<LogMoveSchema>(this.dbName, 1, {
      upgrade(db) {
        const logmoveStore = db.createObjectStore('logmoveops', {
          keyPath: ['clock', 'replicaId'],
          autoIncrement: false, // we generate our own keys, this is required since compound indexes with an auto-incremented key do not work everywhere (yet)
        })
        logmoveStore.createIndex('ops-for-replica', ['replicaId', 'clock'])
      },
    })
    console.log(`clock is '${this.#clock}' at startup`)
    await this.checkReplicaSetJoined()
    if (!this.joinProtocol.hasJoinedReplicaSet()) {
      this.joinProtocol.JoinEvent.on(async () => await this.checkReplicaSetJoined())
    }
  }

  private async checkReplicaSetJoined() {
    if (this.joinProtocol.hasJoinedReplicaSet()) {
      const maxClock = await this.getMaxClock()
      const serverKnownClock = this.joinProtocol.getServerKnownClock()
      const newClock = Math.max(0, Math.max(maxClock, serverKnownClock)) + 1
      // TODO: fix bug  because we have: Setting new clock to 'NaN' because maxClock = -1 and serverKnownClock = undefined
      console.log(
        `Setting new clock to '${newClock}' because maxClock = ${maxClock} and serverKnownClock = ${serverKnownClock}`
      )
      this.#clock = newClock
    }
  }

  private ensureClockIsInitialized() {
    assert(
      this.#clock > -1,
      `Our local clock is not initialized: '${
        this.#clock
      }', we probably have not joined the replicaset yet`
    )
  }

  async deinit(): Promise<void> {
    if (this.#db) {
      this.#db.close()
      this.#db = null
    }
  }

  getAndIncrementClock(): number {
    this.ensureClockIsInitialized()
    const clock = this.#clock
    this.#clock++
    return clock
  }

  updateWithExternalClock(externalClock: number): void {
    this.ensureClockIsInitialized()
    if (externalClock > this.#clock) {
      this.#clock = externalClock + 1
    }
  }

  addListener(listener: EventStorageListener): void {
    this.#listeners.push(listener)
  }

  removeListener(listener: EventStorageListener): void {
    const index = this.#listeners.indexOf(listener)
    if (index > -1) {
      this.#listeners.splice(index, 1)
    }
  }

  private notifyListeners(callback: (EventStorageListener) => void) {
    for (const listener of this.#listeners) {
      callback(listener)
    }
  }

  async storeEvent(logMoveRecord: LogMoveRecord): Promise<void> {
    if (this.#knownReplicaSet) {
      // if we already have a replicaset cache, make sure to update it
      const existingKnownClock = this.#knownReplicaSet[logMoveRecord.replicaId]
      if (!existingKnownClock || existingKnownClock < logMoveRecord.clock) {
        this.#knownReplicaSet[logMoveRecord.replicaId] = logMoveRecord.clock
      }
    }
    this.ensureClockIsInitialized()
    const tx = this.#db.transaction('logmoveops', 'readwrite')
    try {
      // we only need to wait for onsuccess if we are interested in generated keys, and we are not since they are pregenerated
      await tx.store.add(logMoveRecord)
      await tx.done
      // TODO: this needs to be move to an async op at this point the events are not stored yet
      this.notifyListeners((listener: EventStorageListener) => listener.eventStored(logMoveRecord))
    } catch (error) {
      console.error(
        `store error for logMoveRecords ${JSON.stringify(logMoveRecord)}: `,
        JSON.stringify(error),
        error
      )
      throw error
    }
  }

  async updateEvent(logMoveRecord: LogMoveRecord): Promise<void> {
    this.ensureClockIsInitialized()
    await this.#db.put('logmoveops', logMoveRecord)
  }

  async undoAllNewerLogmoveRecordsInReverse(
    clock: number,
    replicaId: string
  ): Promise<LogMoveRecord[]> {
    this.ensureClockIsInitialized()
    const deletedLogMoveRecords = []
    const tx = this.#db.transaction('logmoveops', 'readwrite')
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
        deletedLogMoveRecords.push(currentRecord)
      } else {
        break
      }
    }
    await tx.done
    return Promise.resolve(deletedLogMoveRecords)
  }

  private async getMaxClock(): Promise<number> {
    const cursor = await this.#db
      .transaction('logmoveops', 'readonly')
      .store.openCursor(null, 'prev')
    if (cursor) {
      return cursor.value.clock
    } else {
      return -1
    }
  }

  async getEventsForReplicaSince(
    replicaId: string,
    clock: number,
    batchSize: number
  ): Promise<LogMoveRecord[]> {
    const range = IDBKeyRange.bound([replicaId, clock], [replicaId, Number.MAX_VALUE], true, true) // do not include lower bound
    return await this.#db.getAllFromIndex('logmoveops', 'ops-for-replica', range, batchSize)
  }

  async getKnownReplicaSet(): Promise<Replica[]> {
    if (!this.#knownReplicaSet) {
      // we don't yet have a cached replicaset, so build it lazily
      const knownReplicaSet: { [key: string]: number } = {}
      let cursor = await this.#db.transaction('logmoveops', 'readonly').store.openCursor()
      while (cursor) {
        const logmoveRecord = cursor.value
        const existingReplicaClock = knownReplicaSet[logmoveRecord.replicaId]
        if (!existingReplicaClock || existingReplicaClock < logmoveRecord.clock) {
          knownReplicaSet[logmoveRecord.replicaId] = logmoveRecord.clock
        }
        cursor = await cursor.continue()
      }
      this.#knownReplicaSet = knownReplicaSet
    }
    return Object.keys(this.#knownReplicaSet).map((key) => {
      return { replicaId: key, clock: this.#knownReplicaSet[key] }
    })
  }
}

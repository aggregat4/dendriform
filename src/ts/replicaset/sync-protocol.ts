import { DBSchema, IDBPDatabase, openDB } from 'idb'
import { LifecycleAware } from '../domain/lifecycle'
import { MoveOpTree } from '../moveoperation/moveoperation'
import { IdbReplicaStorage } from '../storage/idb-replicastorage'
import { BackoffWithJitterTimeoutStrategy, JobScheduler } from '../utils/jobscheduler'
import { SyncProtocolClient } from './sync-protocol-client'

interface SyncEventsRecord {
  documentId: string
  lastSentClock: number
}

interface SyncEventsSchema extends DBSchema {
  synced: {
    key: string
    value: SyncEventsRecord
  }
}

/**
 * Protocol assumptions:
 *
 * - It is the client's responsibility to track the max clock that it has sent to
 *   the server.
 * - Client and Server MUST always send events in ascending clock value (per replica)
 * - Events are sent in batches that are limited in size. Clients determine server
 *   batchSize with a parameter.
 * - Client events that have a replicaId that are not part of the known replicaset
 *   will be rejected with a 400 Bad Request. The client must join first.
 */
export class SyncProtocol implements LifecycleAware {
  readonly #DEFAULT_DELAY_MS = 1000
  readonly #MAX_DELAY_MS = 60 * 1000
  readonly #syncJobScheduler = new JobScheduler(
    new BackoffWithJitterTimeoutStrategy(this.#DEFAULT_DELAY_MS, this.#MAX_DELAY_MS),
    this.synchronize.bind(this)
  )
  readonly #EVENT_BATCH_SIZE = 250

  #db: IDBPDatabase<SyncEventsSchema>
  #lastSentClock = -1

  constructor(
    readonly dbName: string,
    readonly documentId: string,
    readonly moveOpTree: MoveOpTree,
    readonly client: SyncProtocolClient,
    readonly replicaStore: IdbReplicaStorage
  ) {}

  async init(): Promise<void> {
    this.#db = await openDB<SyncEventsSchema>(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore('synced', {
          keyPath: 'documentId',
          autoIncrement: false,
        })
      },
    })
    const syncEventsRecord = await this.loadSyncEventsRecord()
    if (syncEventsRecord) {
      this.#lastSentClock = syncEventsRecord.lastSentClock
    }
    await this.#syncJobScheduler.start(false)
  }

  private async loadSyncEventsRecord(): Promise<SyncEventsRecord> {
    return await this.#db.get('synced', this.documentId)
  }

  private async saveSyncEventsRecord(syncEventsRecord: SyncEventsRecord) {
    await this.#db.put('synced', syncEventsRecord)
  }

  async deinit(): Promise<void> {
    if (this.#db) {
      this.#db.close()
      this.#db = null
    }
    await this.#syncJobScheduler.stopAndWaitUntilDone()
  }

  private async synchronize() {
    const knownReplicaSet = await this.moveOpTree.getKnownReplicaSet()
    const eventsToSend = await this.moveOpTree.getLocalMoveOpsSince(
      this.#lastSentClock,
      this.#EVENT_BATCH_SIZE
    )
    const response = await this.client.sync({
      events: eventsToSend,
      replicaSet: knownReplicaSet,
    })
    // TODO: send new remote events to the moveoptree
    // TODO: send the new state of the replicaset to the service that takes care of scheduling gc
  }
}

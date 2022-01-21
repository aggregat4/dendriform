// Local storage of the current state of the tree and the contents of the nodes
// Having this persisted tree storage will allow us to garbage collect the event log
import { openDB, IDBPDatabase, DBSchema } from 'idb'
import { LifecycleAware } from '../domain/lifecycle'
import { generateUUID } from '../utils/util'

/**
 * Metadata about the state of the local replica.
 */
export interface ReplicaRecord {
  replicaId: string
}

interface ReplicaSchema extends DBSchema {
  replica: {
    key: string
    value: ReplicaRecord
  }
}

export class IdbReplicaStorage implements LifecycleAware {
  private db: IDBPDatabase<ReplicaSchema>
  private replica: ReplicaRecord

  constructor(readonly dbName: string) {}

  async init(): Promise<void> {
    this.db = await openDB<ReplicaSchema>(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore('replica', {
          keyPath: 'replicaId',
          autoIncrement: false,
        })
      },
    })
    await this.loadOrCreateReplica()
  }

  private async loadOrCreateReplica(): Promise<void> {
    const replica = await this.loadReplica()
    if (replica == null) {
      this.replica = {
        replicaId: generateUUID(),
      }
      await this.storeReplica(this.replica)
    } else {
      this.replica = replica
    }
  }

  async deinit(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  getReplicaId(): string {
    return this.replica.replicaId
  }

  private async loadReplica(): Promise<ReplicaRecord> {
    return this.db.getAll('replica').then(async (replicas) => {
      if (!replicas || replicas.length === 0) {
        return null
      } else {
        return replicas[0]
      }
    })
  }

  private async storeReplica(replica: ReplicaRecord) {
    const tx = this.db.transaction('replica', 'readwrite')
    await tx.store.put(replica)
  }
}

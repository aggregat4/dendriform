// Local storage of the current state of the tree and the contents of the nodes
// Having this persisted tree storage will allow us to garbage collect the event log
import { openDB, IDBPDatabase, DBSchema } from 'idb'
import { LifecycleAware } from '../domain/lifecycle'
import { Replica } from '../eventlog/repository'

interface ReplicaSchema extends DBSchema {
  replica: {
    key: string
    value: Replica
  }
}

export class IdbReplicaStorage implements LifecycleAware {
  private db: IDBPDatabase<ReplicaSchema>

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
  }

  async deinit(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  async loadReplica(): Promise<Replica> {
    return this.db.getAll('replica').then(async (replicas) => {
      if (!replicas || replicas.length === 0) {
        return null
      } else {
        return replicas[0]
      }
    })
  }

  async storeReplica(replica: Replica) {
    const tx = this.db.transaction('replica', 'readwrite')
    await tx.store.put(replica)
  }
}

import { DBSchema, IDBPDatabase, openDB } from 'idb'
import { LifecycleAware } from '../domain/lifecycle'

export interface DocumentSyncRecord {
  documentId: string
  hasJoinedReplicaSet: boolean
  lastSentClock: number
}

interface DocumentSyncSchema extends DBSchema {
  documents: {
    key: string
    value: DocumentSyncRecord
  }
}

export class IdbDocumentSyncStorage implements LifecycleAware {
  #db: IDBPDatabase<DocumentSyncSchema>

  constructor(readonly dbName: string) {}

  async init() {
    this.#db = await openDB<DocumentSyncSchema>(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore('documents', {
          keyPath: 'documentId',
          autoIncrement: false,
        })
      },
    })
  }

  async deinit() {
    if (this.#db) {
      this.#db.close()
      this.#db = null
    }
  }

  async loadDocument(documentId: string): Promise<DocumentSyncRecord> {
    return await this.#db.get('documents', documentId)
  }

  async saveDocument(documentSyncRecord: DocumentSyncRecord) {
    // assert(
    //   this.#startClock > -1,
    //   `If you store the current document you need to have a valid startClock`
    // )
    await this.#db.put('documents', documentSyncRecord)
  }
}

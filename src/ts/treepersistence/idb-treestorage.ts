// Local storage of the current state of the tree and the contents of the nodes
// Having this persisted tree storage will allow us to garbage collect the event log
import { openDB, IDBPDatabase, DBSchema } from 'idb'
import { LifecycleAware } from '../domain/lifecycle'
import { RepositoryNode } from '../repository/repository'

interface ParentRelationship {
  childId: string
  parentId: string
}

interface TreeStoreSchema extends DBSchema {
  nodes: {
    key: string
    value: RepositoryNode
  }
  parents: {
    key: string
    value: ParentRelationship
  }
}

export class IdbTreeStorage implements LifecycleAware {
  private db: IDBPDatabase<TreeStoreSchema>

  constructor(readonly dbName: string) {}

  async init(): Promise<void> {
    try {
      this.db = await openDB<TreeStoreSchema>(this.dbName, 1, {
        upgrade(db) {
          db.createObjectStore('nodes', {
            keyPath: '_id',
            autoIncrement: false,
          })
          db.createObjectStore('parents', {
            keyPath: 'childId',
            autoIncrement: false,
          })
        },
      })
    } catch (e) {
      console.error(
        `Error initialising tree storage, note that Firefox does not (yet) allow IndexedDB in private browsing mode: `,
        e
      )
    }
  }

  async deinit(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  async getNode(nodeId: string): Promise<RepositoryNode> {
    return this.db.get('nodes', nodeId)
  }

  async saveNode(node: RepositoryNode): Promise<void> {
    await this.db.put('nodes', node)
  }

  async getParent(childId: string): Promise<string> {
    const parent = await this.db.get('parents', childId)
    return parent ? parent.parentId : null
  }

  async saveParent(childId: string, parentId: string): Promise<void> {
    await this.db.put('parents', { childId, parentId })
  }
}

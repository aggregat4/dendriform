// Local storage of the current state of the tree and the contents of the nodes
// Having this persisted tree storage will allow us to garbage collect the event log
import { openDB, IDBPDatabase, DBSchema } from 'idb'
import { LifecycleAware } from '../domain/lifecycle'
import { atomIdent } from '../lib/modules/logootsequence'
import { RepositoryNode } from '../repository/repository'

export interface StoredNode extends RepositoryNode {
  parentId: string
  logootPos: atomIdent
}

export const ROOT_STORED_NODE: StoredNode = {
  id: 'ROOT',
  name: 'ROOT',
  note: null,
  collapsed: false,
  deleted: false,
  completed: false,
  created: 0,
  updated: 0,
  parentId: null,
  logootPos: null,
}

interface TreeStoreSchema extends DBSchema {
  nodes: {
    key: string
    value: StoredNode
  }
}

export class IdbTreeStorage implements LifecycleAware {
  private db: IDBPDatabase<TreeStoreSchema>

  constructor(readonly dbName: string) {}

  async init(): Promise<void> {
    this.db = await openDB<TreeStoreSchema>(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore('nodes', {
          keyPath: 'id',
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

  async loadNode(nodeId: string): Promise<StoredNode> {
    return this.db.get('nodes', nodeId)
  }

  async storeNode(node: StoredNode): Promise<void> {
    await this.db.put('nodes', node)
  }

  async deleteNode(nodeId: string): Promise<void> {
    await this.db.delete('nodes', nodeId)
  }

  async *nodeGenerator(): AsyncGenerator<StoredNode, void, void> {
    let cursor = await this.db.transaction('nodes').store.openCursor()
    while (cursor) {
      yield cursor.value
      cursor = await cursor.continue()
    }
  }
}

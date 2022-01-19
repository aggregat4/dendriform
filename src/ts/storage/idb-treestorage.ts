// Local storage of the current state of the tree and the contents of the nodes
// Having this persisted tree storage will allow us to garbage collect the event log
import { openDB, IDBPDatabase, DBSchema } from 'idb'
import { RelativeNodePosition, RELATIVE_NODE_POSITION_UNCHANGED } from '../domain/domain'
import { LifecycleAware } from '../domain/lifecycle'
import { atomIdent } from '../lib/modules/logootsequence'
import { LogootSequenceWrapper } from '../repository/logoot-sequence-wrapper'
import { RepositoryNode } from '../repository/repository'
import { assert } from '../utils/util'

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

export interface LogootPositionQualifier {
  clock: number
  replicaId: string
  relativePosition: RelativeNodePosition
}

interface TreeStoreSchema extends DBSchema {
  nodes: {
    key: string
    value: StoredNode
  }
}

export class IdbTreeStorage implements LifecycleAware {
  private db: IDBPDatabase<TreeStoreSchema>
  private parentChildMap: { [key: string]: LogootSequenceWrapper } = {}
  private childParentMap: { [key: string]: string } = {}

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
    await this.initParentChildMap()
  }

  private getOrCreateChildrenSequence(
    parentId: string,
    parentChildMap: { [key: string]: LogootSequenceWrapper }
  ): LogootSequenceWrapper {
    return parentChildMap[parentId] || (parentChildMap[parentId] = new LogootSequenceWrapper())
  }

  getChildrenSequence(parentId: string): LogootSequenceWrapper | null {
    return this.parentChildMap[parentId]
  }

  // TODO: consider moving all tree related logic into  IdTreeStorage and "just" expose RepositoryNodes from there (no StoredNodes and logootpos and all that jazz)
  private async initParentChildMap(): Promise<void> {
    const newParentChildMap: { [key: string]: LogootSequenceWrapper } = {}
    const newChildParentMap: { [key: string]: string } = {}
    // Special casing the ROOT node
    this.getOrCreateChildrenSequence('ROOT', newParentChildMap)
    // iterate over all nodes in tree storage and add them to the tree
    for await (const node of this.nodeGenerator()) {
      const parentSeq = this.getOrCreateChildrenSequence(node.parentId, newParentChildMap)
      parentSeq.insertAtAtomIdent(node.id, node.logootPos)
      // we also need to create an empty sequence for the node itself if it does not already exist so we can query it later
      this.getOrCreateChildrenSequence(node.id, newParentChildMap)
      newChildParentMap[node.id] = node.parentId
    }
    this.parentChildMap = newParentChildMap
    this.childParentMap = newChildParentMap
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

  async storeNode(node: StoredNode, positionQualifier: LogootPositionQualifier): Promise<void> {
    const newParentSeq = this.getChildrenSequence(node.parentId)
    assert(
      !!newParentSeq,
      `Parent ${node.parentId} is not already known for child ${node.id} being stored, and it should be`
    )
    if (!node.logootPos) {
      assert(
        !!positionQualifier,
        'When a logoot position is not provided when storing a node we need a LogootPositionQualifier so we can generate a new one'
      )
    }
    const existingLogootPos = newParentSeq.getAtomIdentForItem(node.id)
    const oldParentId = this.childParentMap[node.id]
    if (oldParentId) {
      const oldParentSeq = this.getChildrenSequence(oldParentId)
      oldParentSeq.deleteElement(node.id)
      console.debug(`Deleted ${node.id} from its old parent sequence for parent ${oldParentId}`)
      console.debug(`Old parent sequence is now: `, JSON.stringify(oldParentSeq.toArray()))
    }
    if (node.logootPos) {
      newParentSeq.insertAtAtomIdent(node.id, node.logootPos)
      console.debug(`Added ${node.id} with explicit logootpos to new parent ${node.parentId}`)
    } else {
      if (positionQualifier.relativePosition == RELATIVE_NODE_POSITION_UNCHANGED) {
        assert(
          !!existingLogootPos,
          'If we store a local node and we claim its position is unchanged then it must have an existing position'
        )
        newParentSeq.insertAtAtomIdent(node.id, existingLogootPos)
        console.debug(`Added ${node.id} with existing logootpos to new parent ${node.parentId}`)
        node.logootPos = existingLogootPos
      } else {
        const newLogootPos = newParentSeq.insertElement(
          node.id,
          positionQualifier.relativePosition,
          positionQualifier.clock,
          positionQualifier.replicaId
        )
        console.debug(
          `Added ${node.id} with newly generated logootpos to new parent ${node.parentId}`
        )
        node.logootPos = newLogootPos
      }
    }
    console.debug(`New parent sequence: `, JSON.stringify(newParentSeq.toArray()))
    await this.db.put('nodes', node)
    // in case we create a new node we also need to make an empty logootsequence
    this.getOrCreateChildrenSequence(node.id, this.parentChildMap)
    this.childParentMap[node.id] = node.parentId
  }

  async deleteNode(nodeId: string): Promise<void> {
    await this.db.delete('nodes', nodeId)
    const parentId = this.childParentMap[nodeId]
    delete this.childParentMap[nodeId]
    // We assume that this node will have no children (because it was new) so we can safely remove it from the parentChildMap without ophaning children
    const parentSeq = this.getChildrenSequence(parentId)
    parentSeq.deleteElement(nodeId)
    // TODO: test this removal logic! Do I have all the loose ends?
    delete this.parentChildMap[nodeId]
  }

  private async *nodeGenerator(): AsyncGenerator<StoredNode, void, void> {
    let cursor = await this.db.transaction('nodes').store.openCursor()
    while (cursor) {
      yield cursor.value
      cursor = await cursor.continue()
    }
  }

  isAncestorOf(nodeId: string, parentId: string): boolean {
    if (parentId == nodeId) {
      return true
    } else {
      const grandParentId = this.childParentMap[parentId]
      if (grandParentId != null) {
        return this.isAncestorOf(nodeId, grandParentId)
      } else {
        return false
      }
    }
  }

  isNodeKnown(nodeId: string): boolean {
    return !!this.parentChildMap[nodeId]
  }

  /**
   * Returns the children of the current node from our cache.
   * @returns The array of children. In case the node is not known in our cache an empty list is returned.
   *          The caller is responsible for verifying whether the node actually exists.
   */
  getChildIds(nodeId: string): string[] {
    const children = this.parentChildMap[nodeId]
    if (children) {
      return children.toArray()
    } else {
      return []
    }
  }
}

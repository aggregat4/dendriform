// Local storage of the current state of the tree and the contents of the nodes
// Having this persisted tree storage will allow us to garbage collect the event log
import { DBSchema, IDBPDatabase, IDBPTransaction, openDB } from 'idb'
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

export interface NodeModification {
  modified: boolean
  oldNode: StoredNode
  newNode: StoredNode
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

  private getChildrenSequence(parentId: string): LogootSequenceWrapper | null {
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
    console.debug(
      `loadNode() in treestorage: before calling get on ${this.db} for nodeId ${nodeId}`
    )
    return await this.db.get('nodes', nodeId)
  }

  /*
   * @param node The node to store.
   * @param positionQualifier Where the node should be positioned in the sequence of its parent's children.
   * @returns true when the node was stored, false when the node isn't stored. For example in case storing
   *   the node would cause a cycle.
   */
  async storeNode(
    node: StoredNode,
    positionQualifier: LogootPositionQualifier,
    returnOnParentUnknown: boolean
  ): Promise<NodeModification> {
    const tx = this.db.transaction('nodes', 'readwrite')
    return await this.storeNodeInternal(tx, node, positionQualifier, returnOnParentUnknown)
  }

  async storeNodeInternal(
    tx: IDBPTransaction<TreeStoreSchema, ['nodes'], 'readwrite'>,
    node: StoredNode,
    positionQualifier: LogootPositionQualifier,
    returnOnParentUnknown: boolean
  ): Promise<NodeModification> {
    console.debug(`DEBUG: storeNode for node ${JSON.stringify(node)}`)
    if (!this.isNodeKnown(node.parentId)) {
      if (returnOnParentUnknown) {
        return {
          modified: false,
          newNode: null,
          oldNode: null,
        }
      } else {
        throw new Error(
          `When updating a node ${node.id} we assume that the parent ${node.parentId} is known in our parent child map`
        )
      }
    }
    // if the new node is equal to the parent or is an ancestor of the parent, we ignore the moveop
    // This prevents cycles
    if (this.isAncestorOf(node.id, node.parentId)) {
      console.debug(
        `The new node ${node.id} is an ancestor of ${node.parentId}, can not apply operation`
      )
      return {
        modified: false,
        oldNode: null,
        newNode: null,
      }
    }
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
          `If we store a local node and we claim its position is unchanged then it must have an existing position. Node: ${JSON.stringify(
            node
          )}`
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
    try {
      // console.debug(`about to call put on ${this.db} for node ${JSON.stringify(node)}`)
      await tx.store.put(node)
    } catch (e) {
      console.error(`Error putting ${node.id} `, e)
      throw e
    }
    console.debug(`after calling PUT`)
    // in case we create a new node we also need to make an empty logootsequence
    this.getOrCreateChildrenSequence(node.id, this.parentChildMap)
    this.childParentMap[node.id] = node.parentId
    return {
      modified: true,
      newNode: node,
      oldNode: null,
    }
  }

  async updateNode(
    nodeId: string,
    positionQualifier: LogootPositionQualifier,
    updateFun: (node: StoredNode) => boolean
  ): Promise<NodeModification> {
    const tx = this.db.transaction('nodes', 'readwrite')
    // we need to retrieve the current (or old) node so we can record the change from old to new
    const oldNode = await tx.store.get(nodeId)
    assert(
      !!oldNode,
      `When updating a node and wanting to modify its contents, the node must already exist but we can't find the node with id ${nodeId}`
    )
    const newNode = copyNode(oldNode)
    // the update function can indicate whether or not it changed anything and if not, we bail
    if (!updateFun(newNode)) {
      return {
        modified: false,
        oldNode,
        newNode,
      }
    }
    const nodeModification = await this.storeNodeInternal(tx, newNode, positionQualifier, false)
    return {
      modified: nodeModification.modified,
      oldNode,
      newNode: nodeModification.newNode,
    }
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

  // TODO: cacherefactoring: just use loadnode for now to determine parent?
  isAncestorOf(nodeId: string, parentId: string): boolean {
    // require special casing for ROOT as that node is not regularly part of the tree
    // if (parentId === nodeId || parentId === 'ROOT') {
    if (parentId === nodeId) {
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

  // TODO: cacherefactoring: change to a db query
  isNodeKnown(nodeId: string): boolean {
    return !!this.parentChildMap[nodeId]
  }

  /**
   * Returns the children of the current node from our cache.
   *
   * @returns The array of children. In case the node is not known in our cache
   *   an empty list is returned. The caller is responsible for verifying
   *   whether the node actually exists.
   *
   * TODO: cacherefactoring: change this to a getChildren call that retrieves them all (for loadRecursive)
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

export function copyNode(node: StoredNode): StoredNode {
  return {
    id: node.id,
    parentId: node.parentId,
    name: node.name,
    note: node.note,
    created: node.created,
    updated: node.updated,
    logootPos: node.logootPos,
    collapsed: node.collapsed,
    completed: node.completed,
    deleted: node.deleted,
  }
}

import { test, fail } from '../../lib/tizzy'
import expect from 'ceylon'
import { deleteDB } from 'idb'
import { LogAndTreeStorageRepository } from 'src/ts/repository/repository-logandtreestorage'
import { MoveOpTree } from 'src/ts/moveoperation/moveoperation'
import { IdbReplicaStorage } from 'src/ts/storage/idb-replicastorage'
import { IdbLogMoveStorage } from 'src/ts/storage/idb-logmovestorage'
import { IdbTreeStorage } from 'src/ts/storage/idb-treestorage'
import { RELATIVE_NODE_POSITION_END } from 'src/ts/domain/domain'
import { ALWAYS_TRUE } from 'src/ts/utils/util'
import { deinitAll, initAll, register } from 'src/ts/domain/lifecycle'
import { secondsSinceEpoch } from 'src/ts/utils/dateandtime'
import { ROOT_NODE } from 'src/ts/repository/repository'

function testWithRepo(t: (repo: LogAndTreeStorageRepository) => Promise<void>): () => void {
  return async () => {
    const initializables = []
    const replicaStore = register(new IdbReplicaStorage('replicastoredb'), initializables)
    const logMoveStore = register(new IdbLogMoveStorage('logmovestoredb'), initializables)
    const treeStore = register(new IdbTreeStorage('treestoredb'), initializables)
    const moveOpTree = register(
      new MoveOpTree(replicaStore, logMoveStore, treeStore),
      initializables
    )
    const repo = register(new LogAndTreeStorageRepository(moveOpTree), initializables)
    await initAll(initializables)
    try {
      await t(repo)
    } finally {
      await deinitAll(initializables)
      deleteDB('replicastoredb')
      deleteDB('logmovestoredb')
      deleteDB('treestoredb')
    }
  }
}

test(
  'Creating a new node with just a name as a child of ROOT and then changing it',
  testWithRepo(async (repo) => {
    await repo.createNode('abc123', 'ROOT', 'foobar', null, true, RELATIVE_NODE_POSITION_END)
    const loadedNode = await repo.loadNode('abc123', ALWAYS_TRUE)
    // t.notEqual(loadedNode, null)
    expect(loadedNode).toExist()
    expect(loadedNode.name).toEqual('foobar')
    expect(loadedNode.note).toNotExist()
    expect(loadedNode.collapsed).toBeFalse()
    expect(loadedNode.completed).toBeFalse()
    expect(loadedNode.deleted).toBeFalse()
    const currentTime = secondsSinceEpoch()
    expect(loadedNode.created).toBeGreaterThan(currentTime - 120)
    expect(loadedNode.created).toBeLessThan(currentTime + 1)
    expect(loadedNode.updated).toBeGreaterThan(currentTime - 120)
    expect(loadedNode.updated).toBeLessThan(currentTime + 1)
    loadedNode.name = 'QUX'
    loadedNode.note = 'QUX note'
    loadedNode.collapsed = true
    loadedNode.deleted = true
    loadedNode.completed = true
    // just updating the contents of the node
    await repo.updateNode(loadedNode, 'ROOT', true)
    const updatedNode = await repo.loadNode('abc123', ALWAYS_TRUE)
    expect(updatedNode).toExist()
    expect(updatedNode.name).toEqual('QUX')
    expect(updatedNode.note).toEqual('QUX note')
    expect(updatedNode.collapsed).toBeTrue('collapsed should be true')
    expect(updatedNode.completed).toBeTrue('completed should be true')
    expect(updatedNode.deleted).toBeTrue('deleted should be true')
  })
)

test(
  'Moving nodes between parents',
  testWithRepo(async (repo) => {
    await repo.createNode('parent1', 'ROOT', null, null, true, RELATIVE_NODE_POSITION_END)
    await repo.createNode('parent2', 'ROOT', null, null, true, RELATIVE_NODE_POSITION_END)
    await repo.createNode('child1', 'parent1', null, null, true, RELATIVE_NODE_POSITION_END)
    const rootNode = ROOT_NODE
    const parent1Node = await repo.loadNode('parent1', ALWAYS_TRUE)
    const child1Node = await repo.loadNode('child1', ALWAYS_TRUE)
    const child1Tree = await repo.loadTree('child1', ALWAYS_TRUE, true)
    // I can't easily compare the objects directly since the stored nodes are really StoredNode objects
    // and they contain 2 additional properties (parentId and logootPos)
    expect(child1Tree.ancestors.map((a) => a.id)).toEqual([parent1Node, rootNode].map((a) => a.id))
    expect(child1Tree.tree.children.elements).toHaveLength(0)
    expect(await repo.getChildIds('parent1')).toEqual([child1Node.id])
    expect(await repo.getParentId('child1')).toEqual('parent1')
    await repo.reparentNode(child1Node, 'parent2', RELATIVE_NODE_POSITION_END, true)
    const newChild1Tree = await repo.loadTree('child1', ALWAYS_TRUE, true)
    expect(newChild1Tree.ancestors.map((a) => a.id)).toEqual(['parent2', 'ROOT'])
    // Move to non existent parent
    try {
      await repo.reparentNode(child1Node, 'nonexistentparent', RELATIVE_NODE_POSITION_END, true)
      fail('We should not be able to reparent to a non existing parent node')
    } catch (e) {
      // this is expected, it should throw because the parent does not exist
    }
    // move the child back to original parent
    await repo.reparentNode(child1Node, 'parent1', RELATIVE_NODE_POSITION_END, true)
    expect(await repo.getChildIds('parent1')).toEqual([child1Node.id])
    expect(await repo.getChildIds('parent2')).toEqual([])
    expect(await repo.getParentId('child1')).toEqual('parent1')
  })
)

import { after, test } from '../../lib/tizzy'
import expect from 'ceylon'
import { deleteDB } from 'idb'
import { LogAndTreeStorageRepository } from 'src/ts/repository/repository-logandtreestorage'
import { MoveOpTree } from 'src/ts/moveoperation/moveoperation'
import { IdbReplicaStorage } from 'src/ts/storage/idb-replicastorage'
import { IdbLogMoveStorage } from 'src/ts/storage/idb-logmovestorage'
import { IdbTreeStorage } from 'src/ts/storage/idb-treestorage'
import { RELATIVE_NODE_POSITION_END } from 'src/ts/domain/domain'
import { ALWAYS_TRUE } from 'src/ts/utils/util'
import { deinitAll, initAll, LifecycleAware, register } from 'src/ts/domain/lifecycle'
import { secondsSinceEpoch } from 'src/ts/utils/dateandtime'

function createRepo(): [LogAndTreeStorageRepository, LifecycleAware[]] {
  const initializables = []
  const replicaStore = register(new IdbReplicaStorage('replicastoredb'), initializables)
  const logMoveStore = register(new IdbLogMoveStorage('logmovestoredb'), initializables)
  const treeStore = register(new IdbTreeStorage('treestoredb'), initializables)
  const moveOpTree = register(new MoveOpTree(replicaStore, logMoveStore, treeStore), initializables)
  const repo = register(new LogAndTreeStorageRepository(moveOpTree), initializables)
  return [repo, initializables]
}

test('Creating a new node with just a name as a child of ROOT and then changing it', async () => {
  const [repo, initializables] = createRepo()
  await initAll(initializables)
  try {
    await repo.createNode('abc123', 'ROOT', 'foobar', null, true, RELATIVE_NODE_POSITION_END)
    const loadedNode = await repo.loadNode('abc123', ALWAYS_TRUE)
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
  } finally {
    await deinitAll(initializables)
  }
})

after(() => {
  deleteDB('replicastoredb')
  deleteDB('logmovestoredb')
  deleteDB('treestoredb')
})

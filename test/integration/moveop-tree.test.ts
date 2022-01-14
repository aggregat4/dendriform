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
import { deinitAll, initAll, LifecycleAware, register } from 'src/ts/domain/lifecycle'
import { secondsSinceEpoch } from 'src/ts/utils/dateandtime'
import { ROOT_NODE } from 'src/ts/repository/repository'
import { LogootSequenceWrapper } from 'src/ts/repository/logoot-sequence-wrapper'

function testWithMoveOpTree(t: (moveOpTree: MoveOpTree) => Promise<void>): () => void {
  return async () => {
    const initializables = []
    const replicaStore = register(new IdbReplicaStorage('replicastoredb'), initializables)
    const logMoveStore = register(new IdbLogMoveStorage('logmovestoredb'), initializables)
    const treeStore = register(new IdbTreeStorage('treestoredb'), initializables)
    const moveOpTree = register(
      new MoveOpTree(replicaStore, logMoveStore, treeStore),
      initializables
    )
    await initAll(initializables)
    try {
      await t(moveOpTree)
    } finally {
      await deinitAll(initializables)
      deleteDB('replicastoredb')
      deleteDB('logmovestoredb')
      deleteDB('treestoredb')
    }
  }
}

test(
  'Remote replica updates from the same replica in order',
  testWithMoveOpTree(async (moveOpTree) => {
    let clock = 1
    const parentseq = new LogootSequenceWrapper()
    const pos1 = parentseq.insertElement('parent1', RELATIVE_NODE_POSITION_END, clock, 'replica1')
    await moveOpTree.applyMoveOp({
      clock: clock,
      nodeId: 'parent1',
      parentId: 'ROOT',
      replicaId: 'replica1',
      metadata: {
        name: 'parent1',
        note: null,
        created: new Date().getTime(),
        updated: new Date().getTime(),
        flags: 0,
        logootPos: pos1,
      },
    })
    clock++
    const pos2 = parentseq.insertElement('parent2', RELATIVE_NODE_POSITION_END, clock, 'replica1')
    await moveOpTree.applyMoveOp({
      clock: clock,
      nodeId: 'parent2',
      parentId: 'ROOT',
      replicaId: 'replica1',
      metadata: {
        name: 'parent2',
        note: null,
        created: new Date().getTime(),
        updated: new Date().getTime(),
        flags: 0,
        logootPos: pos2,
      },
    })
    clock++
    const childseq = new LogootSequenceWrapper()
    const childpos = childseq.insertElement('child1', RELATIVE_NODE_POSITION_END, clock, 'replica1')
    await moveOpTree.applyMoveOp({
      clock: clock,
      nodeId: 'child1',
      parentId: 'parent1',
      replicaId: 'replica1',
      metadata: {
        name: 'child1',
        note: null,
        created: new Date().getTime(),
        updated: new Date().getTime(),
        flags: 0,
        logootPos: childpos,
      },
    })
    const rootNode = ROOT_NODE
    const parent1Node = await moveOpTree.loadNode('parent1')
    const child1Node = await moveOpTree.loadNode('child1')
    // I can't easily compare the objects directly since the stored nodes are really StoredNode objects
    // and they contain 2 additional properties (parentId and logootPos)
    expect(child1Node).toExist('child1 should exist')
    expect(child1Node.parentId).toEqual('parent1')
    expect(moveOpTree.getChildIds('parent1')).toEqual([child1Node.id])

    // await repo.createNode('parent1', 'ROOT', null, null, true, RELATIVE_NODE_POSITION_END)
    // await repo.createNode('parent2', 'ROOT', null, null, true, RELATIVE_NODE_POSITION_END)
    // await repo.createNode('child1', 'parent1', null, null, true, RELATIVE_NODE_POSITION_END)
    // const rootNode = ROOT_NODE
    // const parent1Node = await repo.loadNode('parent1', ALWAYS_TRUE)
    // const child1Node = await repo.loadNode('child1', ALWAYS_TRUE)
    // const child1Tree = await repo.loadTree('child1', ALWAYS_TRUE, true)
    // // I can't easily compare the objects directly since the stored nodes are really StoredNode objects
    // // and they contain 2 additional properties (parentId and logootPos)
    // expect(child1Tree.ancestors.map((a) => a.id)).toEqual([parent1Node, rootNode].map((a) => a.id))
    // expect(child1Tree.tree.children.elements).toHaveLength(0)
    // expect(await repo.getChildIds('parent1')).toEqual([child1Node.id])
    // expect(await repo.getParentId('child1')).toEqual('parent1')
    // await repo.reparentNode(child1Node, 'parent2', RELATIVE_NODE_POSITION_END, true)
    // const newChild1Tree = await repo.loadTree('child1', ALWAYS_TRUE, true)
    // expect(newChild1Tree.ancestors.map((a) => a.id)).toEqual(['parent2', 'ROOT'])
    // // Move to non existent parent
    // try {
    //   await repo.reparentNode(child1Node, 'nonexistentparent', RELATIVE_NODE_POSITION_END, true)
    //   fail('We should not be able to reparent to a non existing parent node')
    // } catch (e) {
    //   // this is expected, it should throw because the parent does not exist
    // }
    // // move the child back to original parent
    // await repo.reparentNode(child1Node, 'parent1', RELATIVE_NODE_POSITION_END, true)
    // expect(await repo.getChildIds('parent1')).toEqual([child1Node.id])
    // expect(await repo.getChildIds('parent2')).toEqual([])
    // expect(await repo.getParentId('child1')).toEqual('parent1')
  })
)

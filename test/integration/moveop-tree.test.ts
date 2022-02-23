import { test } from '../../lib/tizzy'
import expect from 'ceylon'
import { deleteDB } from 'idb'
import { MoveOp, MoveOpTree } from 'src/ts/moveoperation/moveoperation'
import { IdbReplicaStorage } from 'src/ts/storage/idb-replicastorage'
import { IdbLogMoveStorage } from 'src/ts/storage/idb-logmovestorage'
import { IdbTreeStorage } from 'src/ts/storage/idb-treestorage'
import { RELATIVE_NODE_POSITION_END } from 'src/ts/domain/domain'
import { deinitAll, initAll, register } from 'src/ts/domain/lifecycle'
import { LogootSequenceWrapper } from 'src/ts/repository/logoot-sequence-wrapper'
import { atomIdent } from 'src/ts/lib/modules/logootsequence'
import { JoinProtocol } from 'src/ts/replicaset/join-protocol'
import { MockJoinProtocolClient } from './integration-test-utils'

function testWithMoveOpTree(t: (moveOpTree: MoveOpTree) => Promise<void>): () => void {
  return async () => {
    const initializables = []
    const replicaStore = register(new IdbReplicaStorage('replicastoredb'), initializables)
    const joinProtocol = register(
      new JoinProtocol('joinprotocoldb', 'doc1', replicaStore, new MockJoinProtocolClient(), true),
      initializables
    )
    const logMoveStore = register(
      new IdbLogMoveStorage('logmovestoredb', joinProtocol),
      initializables
    )
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
      await deleteDB('replicastoredb')
      await deleteDB('logmovestoredb')
      await deleteDB('treestoredb')
      await deleteDB('joinprotocoldb')
    }
  }
}

function createMoveOp(
  clock: number,
  nodeId: string,
  parentId: string,
  replicaId: string,
  created: number,
  logootPos: atomIdent
): MoveOp {
  return {
    clock: clock,
    nodeId: nodeId,
    parentId: parentId,
    replicaId: replicaId,
    metadata: {
      name: parentId,
      note: null,
      created: created,
      updated: new Date().getTime(),
      flags: 0,
      logootPos: logootPos,
    },
  }
}

test(
  'Remote replica updates from the same replica in order',
  testWithMoveOpTree(async (moveOpTree) => {
    let clock = 1
    const parentseq = new LogootSequenceWrapper()
    const pos1 = parentseq.insertElement('parent1', RELATIVE_NODE_POSITION_END, clock, 'replica1')
    await moveOpTree.applyMoveOp(
      createMoveOp(clock, 'parent1', 'ROOT', 'replica1', new Date().getTime(), pos1)
    )
    clock++
    const pos2 = parentseq.insertElement('parent2', RELATIVE_NODE_POSITION_END, clock, 'replica1')
    await moveOpTree.applyMoveOp(
      createMoveOp(clock, 'parent2', 'ROOT', 'replica1', new Date().getTime(), pos2)
    )
    clock++
    const childseq = new LogootSequenceWrapper()
    const childpos = childseq.insertElement('child1', RELATIVE_NODE_POSITION_END, clock, 'replica1')
    const childTime = new Date().getTime()
    await moveOpTree.applyMoveOp(
      createMoveOp(clock, 'child1', 'parent1', 'replica1', childTime, childpos)
    )
    const child1Node = await moveOpTree.loadNode('child1')
    // I can't easily compare the objects directly since the stored nodes are really StoredNode objects
    // and they contain 2 additional properties (parentId and logootPos)
    expect(child1Node).toExist('child1 should exist')
    expect(child1Node.parentId).toEqual('parent1')
    expect(moveOpTree.getChildIds('parent1')).toEqual([child1Node.id])
    // reparent child1 to parent2
    clock++
    const childnewseq = new LogootSequenceWrapper()
    const childnewpos = childnewseq.insertElement(
      'child1',
      RELATIVE_NODE_POSITION_END,
      clock,
      'replica1'
    )
    await moveOpTree.applyMoveOp(
      createMoveOp(clock, 'child1', 'parent2', 'replica1', childTime, childnewpos)
    )
    const child1NewNode = await moveOpTree.loadNode('child1')
    expect(child1NewNode).toExist('child1 should exist')
    expect(child1NewNode.parentId).toEqual('parent2')
    expect(moveOpTree.getChildIds('parent1')).toEqual([])
    expect(moveOpTree.getChildIds('parent2')).toEqual([child1NewNode.id])
  })
)

test(
  'Remote replica updates arrive out of order but converge on correct state',
  testWithMoveOpTree(async (moveOpTree) => {
    // First the child event arrives but in reality it should happen after the first two parents are applied
    const childClock = 3
    const childseq = new LogootSequenceWrapper()
    const childpos = childseq.insertElement(
      'child1',
      RELATIVE_NODE_POSITION_END,
      childClock,
      'replica1'
    )
    const childTime = new Date().getTime()
    await moveOpTree.applyMoveOp(
      createMoveOp(childClock, 'child1', 'parent1', 'replica1', childTime, childpos)
    )
    let child1Node = await moveOpTree.loadNode('child1')
    expect(child1Node).toNotExist('child1 should not exist as the parents are not present yet')
    // now we send the required parent moveops so that in the end the child moveop can be applied
    const parent1Clock = 1
    const parentseq = new LogootSequenceWrapper()
    const pos1 = parentseq.insertElement(
      'parent1',
      RELATIVE_NODE_POSITION_END,
      parent1Clock,
      'replica1'
    )
    await moveOpTree.applyMoveOp(
      createMoveOp(parent1Clock, 'parent1', 'ROOT', 'replica1', new Date().getTime(), pos1)
    )
    const parent2Clock = 2
    const pos2 = parentseq.insertElement(
      'parent2',
      RELATIVE_NODE_POSITION_END,
      parent2Clock,
      'replica1'
    )
    await moveOpTree.applyMoveOp(
      createMoveOp(parent2Clock, 'parent2', 'ROOT', 'replica1', new Date().getTime(), pos2)
    )
    child1Node = await moveOpTree.loadNode('child1')
    // Now that the required parent event has arrived, the child should also exist
    expect(child1Node).toExist('child1 should exist')
    expect(child1Node.parentId).toEqual('parent1')
    expect(moveOpTree.getChildIds('parent1')).toEqual([child1Node.id])
  })
)

test(
  'Remote replica updates from the same replica in order',
  testWithMoveOpTree(async (moveOpTree) => {
    let clock = 1
    const parentseq = new LogootSequenceWrapper()
    const pos1 = parentseq.insertElement('parent1', RELATIVE_NODE_POSITION_END, clock, 'replica1')
    await moveOpTree.applyMoveOp(
      createMoveOp(clock, 'parent1', 'ROOT', 'replica1', new Date().getTime(), pos1)
    )
    clock++
    const pos2 = parentseq.insertElement('parent2', RELATIVE_NODE_POSITION_END, clock, 'replica1')
    await moveOpTree.applyMoveOp(
      createMoveOp(clock, 'parent2', 'ROOT', 'replica1', new Date().getTime(), pos2)
    )
    clock++
    const childseq = new LogootSequenceWrapper()
    const childpos = childseq.insertElement('child1', RELATIVE_NODE_POSITION_END, clock, 'replica1')
    const childTime = new Date().getTime()
    await moveOpTree.applyMoveOp(
      createMoveOp(clock, 'child1', 'parent1', 'replica1', childTime, childpos)
    )
    const child1Node = await moveOpTree.loadNode('child1')
    // I can't easily compare the objects directly since the stored nodes are really StoredNode objects
    // and they contain 2 additional properties (parentId and logootPos)
    expect(child1Node).toExist('child1 should exist')
    expect(child1Node.parentId).toEqual('parent1')
    expect(moveOpTree.getChildIds('parent1')).toEqual([child1Node.id])
    // reparent child1 to parent2
    clock++
    const childnewseq = new LogootSequenceWrapper()
    const childnewpos = childnewseq.insertElement(
      'child1',
      RELATIVE_NODE_POSITION_END,
      clock,
      'replica1'
    )
    await moveOpTree.applyMoveOp(
      createMoveOp(clock, 'child1', 'parent2', 'replica1', childTime, childnewpos)
    )
    const child1NewNode = await moveOpTree.loadNode('child1')
    expect(child1NewNode).toExist('child1 should exist')
    expect(child1NewNode.parentId).toEqual('parent2')
    expect(moveOpTree.getChildIds('parent1')).toEqual([])
    expect(moveOpTree.getChildIds('parent2')).toEqual([child1NewNode.id])
  })
)

test(
  'After a remote update our own clock is higher than the remote update clock',
  testWithMoveOpTree(async (moveOpTree) => {
    // First the child event arrives but in reality it should happen after the first two parents are applied
    const remoteClock = 42
    const parentseq = new LogootSequenceWrapper()
    const pos1 = parentseq.insertElement(
      'parent1',
      RELATIVE_NODE_POSITION_END,
      remoteClock,
      'replica1'
    )
    await moveOpTree.applyMoveOp(
      createMoveOp(remoteClock, 'parent1', 'ROOT', 'replica1', new Date().getTime(), pos1)
    )
    const childCreationTime = new Date().getTime()
    await moveOpTree.updateLocalNode(
      {
        id: 'child1',
        name: 'child1name',
        note: 'child1note',
        collapsed: true,
        completed: true,
        deleted: true,
        created: childCreationTime,
        updated: childCreationTime,
      },
      'parent1',
      RELATIVE_NODE_POSITION_END
    )
    expect(moveOpTree.getChildIds('parent1')).toEqual(['child1'])
    const newMoveOps = await moveOpTree.getLocalMoveOpsSince(42, 100)
    expect(newMoveOps.length).toBe(1, 'There should only be one local move operation')
    expect(newMoveOps[0].clock).toBeGreaterThan(
      42,
      'Local clock values should be higher than preceding remote clock values'
    )
    console.debug(`Local clock is now ${newMoveOps[0].clock}`)
    expect(newMoveOps[0].nodeId).toBe('child1')
    expect(newMoveOps[0].parentId).toBe('parent1')
    expect(newMoveOps[0].metadata.name).toBe('child1name')
    expect(newMoveOps[0].metadata.note).toBe('child1note')
    expect(newMoveOps[0].metadata.created).toBe(childCreationTime)
    expect(newMoveOps[0].metadata.updated).toBe(childCreationTime)
  })
)

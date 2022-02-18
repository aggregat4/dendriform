import { test } from '../../lib/tizzy'
import expect from 'ceylon'
import { deleteDB } from 'idb'
import { IdbLogMoveStorage } from 'src/ts/storage/idb-logmovestorage'
import { deinitAll, initAll, register } from 'src/ts/domain/lifecycle'

function testWithLogMoveStorage(
  t: (logMoveStorage: IdbLogMoveStorage) => Promise<void>
): () => void {
  return async () => {
    const initializables = []
    const logMoveStore = register(new IdbLogMoveStorage('logmovestoredb'), initializables)
    await initAll(initializables)
    try {
      await t(logMoveStore)
    } finally {
      await deinitAll(initializables)
      await deleteDB('logmovestoredb')
    }
  }
}

test(
  'Undoing on an empty store is a no op',
  testWithLogMoveStorage(async (logMoveStorage) => {
    await logMoveStorage.undoAllNewerLogmoveRecordsInReverse(0, 'replica1')
  })
)

test(
  'When we undo one event there are no events left',
  testWithLogMoveStorage(async (logMoveStorage) => {
    await logMoveStorage.storeEvent([
      {
        clock: 1,
        replicaId: 'replica1',
        childId: 'child1',
        applied: true,
        newParentId: null,
        newPayload: null,
        oldParentId: null,
        oldPayload: null,
      },
    ])
    let events = await logMoveStorage.getEventsForReplicaSince('replica1', 0, 100)
    expect(events.length).toBe(1)
    await logMoveStorage.undoAllNewerLogmoveRecordsInReverse(0, 'replica1')
    events = await logMoveStorage.getEventsForReplicaSince('replica1', 0, 100)
    expect(events.length).toBe(0)
  })
)

test(
  'When we undo one event we can readd that event afterwards',
  testWithLogMoveStorage(async (logMoveStorage) => {
    const logMoveEvent = {
      clock: 1,
      replicaId: 'replica1',
      childId: 'child1',
      applied: true,
      newParentId: null,
      newPayload: null,
      oldParentId: null,
      oldPayload: null,
    }
    await logMoveStorage.storeEvent([logMoveEvent])
    let events = await logMoveStorage.getEventsForReplicaSince('replica1', 0, 100)
    expect(events.length).toBe(1)
    await logMoveStorage.undoAllNewerLogmoveRecordsInReverse(0, 'replica1')
    events = await logMoveStorage.getEventsForReplicaSince('replica1', 0, 100)
    expect(events.length).toBe(0)
    await logMoveStorage.storeEvent([logMoveEvent])
    events = await logMoveStorage.getEventsForReplicaSince('replica1', 0, 100)
    expect(events.length).toBe(1)
    expect(events[0]).toEqual(logMoveEvent)
  })
)

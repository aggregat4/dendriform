import {LocalEventLogIdMapper} from '../src/ts/eventlog/eventlog-indexeddb-peerid-mapper'

export async function testPeerIdMapper() {
  const mapper = new LocalEventLogIdMapper('testdb')
  await mapper.init()
  try {
    const localId = await mapper.externalToInternalPeerId('foo')
    const originalId = await mapper.internalToExternalPeerId(localId)
    if (originalId !== 'foo') {
      throw new Error(`stored id is not mapped back to original, instead of "foo" we got "$originalId"`)
    } else {
      console.log(`test succeeded, ids are the same`)
    }
  } finally {
    await mapper.deinit()
  }
}

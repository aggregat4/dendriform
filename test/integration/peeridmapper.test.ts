import { after, test } from '../../lib/tizzy'
import expect from 'ceylon'
import { LocalEventLogIdMapper } from '../../src/ts/eventlog/idb-peerid-mapper'
import { deleteDB } from 'idb'

test('Mapping an id is reversible', async () => {
  const mapper = new LocalEventLogIdMapper('testdb')
  await mapper.init()
  try {
    const localId = await mapper.externalToInternalPeerId('foo')
    const originalId = mapper.internalToExternalPeerId(localId)
    expect(originalId).toEqual('foo')
    const localId2 = await mapper.externalToInternalPeerId('foo')
    expect(localId2).toEqual(localId)
    expect(mapper.internalToExternalPeerId(localId2)).toEqual(originalId)
  } finally {
    mapper.deinit()
  }
})

after(() => {
  deleteDB('testdb')
})

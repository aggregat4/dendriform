import { after, test } from '../../lib/tizzy'
import expect from 'ceylon'

import { LocalEventLogIdMapper } from '../../src/ts/eventlog/eventlog-indexeddb-peerid-mapper'
import { deleteDB } from 'idb'

test('Mapping an id is reversible', async () => {
  const mapper = new LocalEventLogIdMapper('testdb')
  await mapper.init()
  try {
    const localId = await mapper.externalToInternalPeerId('foo')
    const originalId = mapper.internalToExternalPeerId(localId)
    expect(originalId).toEqual('foo')
  } finally {
    mapper.deinit()
  }
})

after(() => {
  deleteDB('testdb')
})

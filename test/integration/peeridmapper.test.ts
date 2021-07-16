import { after, test } from '../../lib/tizzy'
import expect from 'ceylon'
import { LocalEventLogIdMapper } from '../../src/ts/eventlog/eventlog-indexeddb-peerid-mapper'
import { deleteDB } from 'idb'
import {
  externalToInternalVectorclockValues,
  internalToExternalVectorclockValues,
} from 'src/ts/eventlog/eventlog-indexeddb-utils'

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

test('A vectorclock can have its ids mapped', async () => {
  const mapper = new LocalEventLogIdMapper('testdb')
  await mapper.init()
  try {
    const mappedId1 = await mapper.externalToInternalPeerId('id01')
    const mappedId2 = await mapper.externalToInternalPeerId('id02')
    const mappedId3 = await mapper.externalToInternalPeerId('id03')
    const vectorclock = {
      id01: 1,
      id02: 2,
      id03: 3,
    }
    const mappedVectorclock = await externalToInternalVectorclockValues(mapper, vectorclock)
    expect(mappedVectorclock['id01']).toEqual(undefined)
    expect(mappedVectorclock[mappedId1]).toEqual(1)
    expect(mappedVectorclock['id02']).toEqual(undefined)
    expect(mappedVectorclock[mappedId2]).toEqual(2)
    expect(mappedVectorclock['id03']).toEqual(undefined)
    expect(mappedVectorclock[mappedId3]).toEqual(3)
    expect(internalToExternalVectorclockValues(mapper, mappedVectorclock)).toEqual(vectorclock)
  } finally {
    mapper.deinit()
  }
})

test('An empty vectorclock remains empty after mapping', async () => {
  const mapper = new LocalEventLogIdMapper('testdb')
  await mapper.init()
  try {
    expect(internalToExternalVectorclockValues(mapper, {})).toEqual({})
    expect(await externalToInternalVectorclockValues(mapper, {})).toEqual({})
  } finally {
    mapper.deinit()
  }
})

after(() => {
  deleteDB('testdb')
})

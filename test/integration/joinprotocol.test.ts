import expect from 'ceylon'
import { deleteDB } from 'idb'
import { test } from 'lib/tizzy'
import {
  ApplicationError,
  ERROR_CLIENT_NOT_AUTHORIZED,
  ERROR_JOIN_PROTOCOL_CLIENT_ILLEGALSTATE,
  ERROR_JOIN_PROTOCOL_MISSING_LOCAL_CLOCK,
} from 'src/ts/domain/errors'
import { deinitAll, initAll, register } from 'src/ts/domain/lifecycle'
import { JoinProtocol } from 'src/ts/replicaset/join-protocol'
import { SyncProtocolClient } from 'src/ts/replicaset/sync-protocol-client'
import { IdbDocumentSyncStorage } from 'src/ts/storage/idb-documentsyncstorage'
import { IdbReplicaStorage } from 'src/ts/storage/idb-replicastorage'
import {
  ClientNotAuthorizedErrorThrowingClient,
  IllegalClientServerStateErrorThrowingClient,
  SuccessfulJoinProtocolClient,
} from './integration-test-utils'

function testWithJoinProtocol(
  joinProtocolClient: SyncProtocolClient,
  t: (joinProtocol: JoinProtocol) => Promise<void>
): () => void {
  return async () => {
    const initializables = []
    const replicaStore = register(new IdbReplicaStorage('replicastoredb'), initializables)
    const documentSyncStore = register(
      new IdbDocumentSyncStorage('documentsyncstoragedb'),
      initializables
    )
    const joinProtocol = register(
      new JoinProtocol(documentSyncStore, 'doc1', replicaStore, joinProtocolClient, true),
      initializables
    )
    await initAll(initializables)
    try {
      await t(joinProtocol)
    } finally {
      await deinitAll(initializables)
      await deleteDB('documentsyncstoragedb')
      await deleteDB('replicastoredb')
    }
  }
}

test(
  'join protocol: Client not authorized',
  testWithJoinProtocol(
    new ClientNotAuthorizedErrorThrowingClient(),
    async (joinProtocol: JoinProtocol) => {
      try {
        joinProtocol.hasJoinedReplicaSet()
      } catch (e) {
        expect(e).toBeA(ApplicationError)
        expect((e as ApplicationError).code).toEqual(ERROR_CLIENT_NOT_AUTHORIZED)
      }
    }
  )
)

test(
  'join protocol: illegal state',
  testWithJoinProtocol(
    new IllegalClientServerStateErrorThrowingClient(),
    async (joinProtocol: JoinProtocol) => {
      try {
        joinProtocol.hasJoinedReplicaSet()
      } catch (e) {
        expect(e).toBeA(ApplicationError)
        expect((e as ApplicationError).code).toEqual(ERROR_JOIN_PROTOCOL_CLIENT_ILLEGALSTATE)
      }
    }
  )
)

test(
  'join protocol: Successful join, not previously known',
  testWithJoinProtocol(
    new SuccessfulJoinProtocolClient(100, false),
    async (joinProtocol: JoinProtocol) => {
      expect(joinProtocol.hasJoinedReplicaSet()).toBe(true)
    }
  )
)

test(
  'join protocol: Successful join, previously known, but we have no preexisting start clock',
  testWithJoinProtocol(
    new SuccessfulJoinProtocolClient(100, true),
    async (joinProtocol: JoinProtocol) => {
      try {
        joinProtocol.hasJoinedReplicaSet()
      } catch (e) {
        expect((e as ApplicationError).code).toEqual(ERROR_JOIN_PROTOCOL_MISSING_LOCAL_CLOCK)
      }
    }
  )
)

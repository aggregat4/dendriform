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
import { ClientHasNotJoinedReplicaSetError, JoinProtocol } from 'src/ts/replicaset/join-protocol'
import {
  ClientNotAuthorizedError,
  IllegalClientServerStateError,
  JoinProtocolClient,
  JoinProtocolResponse,
  ServerNotAvailableError,
} from 'src/ts/replicaset/join-protocol-client'
import { IdbReplicaStorage } from 'src/ts/storage/idb-replicastorage'

function testWithJoinProtocol(
  joinProtocolClient: JoinProtocolClient,
  t: (joinProtocol: JoinProtocol) => Promise<void>
): () => void {
  return async () => {
    const initializables = []
    const replicaStore = register(new IdbReplicaStorage('replicastoredb'), initializables)
    const joinProtocol = register(
      new JoinProtocol('joinprotocoldb', 'doc1', replicaStore, joinProtocolClient, true),
      initializables
    )
    await initAll(initializables)
    try {
      await t(joinProtocol)
    } finally {
      await deinitAll(initializables)
      await deleteDB('replicastoredb')
      await deleteDB('joinprotocoldb')
    }
  }
}

class ServerNotAvailableErrorThrowingClient implements JoinProtocolClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  join(documentId: string, replicaId: string): Promise<JoinProtocolResponse> {
    throw new ServerNotAvailableError('')
  }
}

class ClientNotAuthorizedErrorThrowingClient implements JoinProtocolClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  join(documentId: string, replicaId: string): Promise<JoinProtocolResponse> {
    throw new ClientNotAuthorizedError()
  }
}

class IllegalClientServerStateErrorThrowingClient implements JoinProtocolClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  join(documentId: string, replicaId: string): Promise<JoinProtocolResponse> {
    throw new IllegalClientServerStateError('test illegal state')
  }
}

class SuccessfulJoinProtocolClient implements JoinProtocolClient {
  constructor(readonly startClock: number, readonly alreadyKnown: boolean) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  join(documentId: string, replicaId: string): Promise<JoinProtocolResponse> {
    return Promise.resolve({
      alreadyKnown: this.alreadyKnown,
      startClock: this.startClock,
    })
  }
}

test(
  'join protocol: Server not reachable',
  testWithJoinProtocol(
    new ServerNotAvailableErrorThrowingClient(),
    async (joinProtocol: JoinProtocol) => {
      expect(joinProtocol.hasJoinedReplicaSet()).toBe(false)
      try {
        joinProtocol.getStartClock()
      } catch (e) {
        expect(e).toBeA(ClientHasNotJoinedReplicaSetError)
        expect((e as ClientHasNotJoinedReplicaSetError).documentId).toEqual('doc1')
      }
    }
  )
)

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
      expect(joinProtocol.getStartClock()).toBe(100)
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

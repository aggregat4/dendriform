import {
  ClientNotAuthorizedError,
  IllegalClientServerStateError,
} from 'src/ts/replicaset/client-server-errors'
import {
  JoinProtocolResponse,
  SyncProtocolClient,
  SyncProtocolPayload,
} from 'src/ts/replicaset/sync-protocol-client'

export class NewlyJoiningMockJoinProtocolClient implements SyncProtocolClient {
  join(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    documentId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    replicaId: string
  ): Promise<JoinProtocolResponse> {
    return Promise.resolve({
      // The mock client must pretend the client is new, otherwise the joinprotocol will fail
      alreadyKnown: false,
      startClock: 1,
    })
  }

  sync(
    documentId: string,
    replicaId: string,
    batchSize: number,
    payload: SyncProtocolPayload
  ): Promise<SyncProtocolPayload> {
    throw new Error('Method not implemented.')
  }
}

export class ClientNotAuthorizedErrorThrowingClient implements SyncProtocolClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  join(_documentId: string, _replicaId: string): Promise<JoinProtocolResponse> {
    throw new ClientNotAuthorizedError()
  }
  sync(
    _documentId: string,
    _replicaId: string,
    _batchSize: number,
    _payload: SyncProtocolPayload
  ): Promise<SyncProtocolPayload> {
    throw new Error('Method not implemented.')
  }
}

export class IllegalClientServerStateErrorThrowingClient implements SyncProtocolClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  join(_documentId: string, _replicaId: string): Promise<JoinProtocolResponse> {
    throw new IllegalClientServerStateError('test illegal state')
  }
  sync(
    _documentId: string,
    _replicaId: string,
    _batchSize: number,
    _payload: SyncProtocolPayload
  ): Promise<SyncProtocolPayload> {
    throw new Error('Method not implemented.')
  }
}

export class SuccessfulJoinProtocolClient implements SyncProtocolClient {
  constructor(readonly startClock: number, readonly alreadyKnown: boolean) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  join(_documentId: string, _replicaId: string): Promise<JoinProtocolResponse> {
    return Promise.resolve({
      alreadyKnown: this.alreadyKnown,
    })
  }
  sync(
    _documentId: string,
    _replicaId: string,
    _batchSize: number,
    _payload: SyncProtocolPayload
  ): Promise<SyncProtocolPayload> {
    throw new Error('Method not implemented.')
  }
}

import { JoinProtocolClient, JoinProtocolResponse } from 'src/ts/replicaset/join-protocol-client'

export class NewlyJoiningMockJoinProtocolClient implements JoinProtocolClient {
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
}

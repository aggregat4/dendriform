import { JoinProtocolClient, JoinProtocolResponse } from 'src/ts/replicaset/join-protocol-client'

export class NewlyJoiningMockJoinProtocolClient implements JoinProtocolClient {
  join(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    documentId: string,
    replicaId: string
  ): Promise<JoinProtocolResponse> {
    const response = { replicas: [{ replicaId: replicaId, clock: 1 }] }
    return Promise.resolve(response)
  }
}

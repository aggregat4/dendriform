import { JoinProtocolClient, JoinProtocolResponse } from 'src/ts/replicaset/join-protocol-client'

export class NewlyJoiningMockJoinProtocolClient implements JoinProtocolClient {
  join(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    documentId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    replicaId: string
  ): Promise<JoinProtocolResponse> {
    const response = {}
    response[replicaId] = 1
    return Promise.resolve(response)
  }
}

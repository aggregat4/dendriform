import { performFetch } from './http-client-utils'
import { JoinProtocolClient, JoinProtocolResponse } from './join-protocol-client'

export class JoinProtocolHttpClient implements JoinProtocolClient {
  constructor(readonly serverEndpoint: string) {}

  async join(documentId: string, replicaId: string): Promise<JoinProtocolResponse> {
    const response = await performFetch(
      async () =>
        await fetch(`${this.serverEndpoint}documents/${documentId}/replicaset/${replicaId}`, {
          method: 'POST',
          headers: {
            Accept: 'application/json; charset=utf-8',
            'Content-Type': 'application/json; charset=utf-8',
          },
        })
    )
    return (await response.json()) as JoinProtocolResponse
  }
}

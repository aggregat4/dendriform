import { performFetch } from './http-client-utils'
import {
  JoinProtocolResponse,
  SyncProtocolClient,
  SyncProtocolPayload,
} from './sync-protocol-client'

export class SyncProtocolHttpClient implements SyncProtocolClient {
  constructor(readonly serverEndpoint: string) {}

  async join(documentId: string, replicaId: string): Promise<JoinProtocolResponse> {
    const response = await performFetch(
      async () =>
        await fetch(`${this.serverEndpoint}documents/${documentId}/replicaset/${replicaId}`, {
          method: 'PUT',
          headers: {
            Accept: 'application/json; charset=utf-8',
            'Content-Type': 'application/json; charset=utf-8',
          },
        })
    )
    return (await response.json()) as JoinProtocolResponse
  }

  async sync(
    documentId: string,
    replicaId: string,
    batchSize: number,
    payload: SyncProtocolPayload
  ): Promise<SyncProtocolPayload> {
    const response = await performFetch(
      async () =>
        await fetch(
          `${this.serverEndpoint}documents/${documentId}/replicaset/${replicaId}/ops?batchSize=${batchSize}`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
              Accept: 'application/json; charset=utf-8',
              'Content-Type': 'application/json; charset=utf-8',
            },
          }
        )
    )
    return (await response.json()) as SyncProtocolPayload
  }
}

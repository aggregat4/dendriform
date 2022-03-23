import { performFetch } from './http-client-utils'
import { SyncProtocolClient, SyncProtocolPayload } from './sync-protocol-client'

export class SyncProtocolHttpClient implements SyncProtocolClient {
  constructor(readonly serverEndpoint: string) {}

  async sync(
    documentId: string,
    replicaId: string,
    batchSize: number,
    payload: SyncProtocolPayload
  ): Promise<SyncProtocolPayload> {
    const response = await performFetch(
      async () =>
        await fetch(
          `${this.serverEndpoint}documents/${documentId}/replicaset/${replicaId}/events?batchSize=${batchSize}`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
          }
        )
    )
    return (await response.json()) as SyncProtocolPayload
  }
}

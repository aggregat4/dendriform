import { Operation, Replica } from '../moveoperation/moveoperation-types'

export interface SyncProtocolPayload {
  operations: Operation[]
  replicaSet: Replica[]
}

export interface SyncProtocolClient {
  sync(
    documentId: string,
    replicaId: string,
    batchSize: number,
    payload: SyncProtocolPayload
  ): Promise<SyncProtocolPayload>
}

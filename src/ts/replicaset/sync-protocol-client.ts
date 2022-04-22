import { MoveOp, Replica } from '../moveoperation/moveoperation-types'

export interface SyncProtocolPayload {
  events: MoveOp[]
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

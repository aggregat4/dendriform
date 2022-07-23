import { MoveOp, Replica } from '../moveoperation/moveoperation-types'

export interface SyncProtocolPayload {
  events: MoveOp[]
  replicaSet: Replica[]
}

export interface JoinProtocolResponse {
  alreadyKnown: boolean
}

export interface SyncProtocolClient {
  join(documentId: string, replicaId: string): Promise<JoinProtocolResponse>

  sync(
    documentId: string,
    replicaId: string,
    batchSize: number,
    payload: SyncProtocolPayload
  ): Promise<SyncProtocolPayload>
}

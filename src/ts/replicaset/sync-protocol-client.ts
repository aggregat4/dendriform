import { MoveOp } from '../moveoperation/moveoperation'
import { Replica } from '../storage/idb-logmovestorage'

export interface SyncProtocolPayload {
  events: MoveOp[]
  replicaSet: Replica[]
}

export interface SyncProtocolClient {
  sync(payload: SyncProtocolPayload): Promise<SyncProtocolPayload>
}

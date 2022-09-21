import { Replica } from '../moveoperation/moveoperation-types'

export interface JoinProtocolResponse {
  replicas: Replica[]
}

export interface JoinProtocolClient {
  join(documentId: string, replicaId: string): Promise<JoinProtocolResponse>
}

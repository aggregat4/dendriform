export interface JoinProtocolResponse {
  alreadyKnown: boolean
  startClock: number
}

export interface JoinProtocolClient {
  join(documentId: string, replicaId: string): Promise<JoinProtocolResponse>
}

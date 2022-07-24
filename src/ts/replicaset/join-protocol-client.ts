export interface JoinProtocolResponse {
  alreadyKnown: boolean
}

export interface JoinProtocolClient {
  join(documentId: string, replicaId: string): Promise<JoinProtocolResponse>
}

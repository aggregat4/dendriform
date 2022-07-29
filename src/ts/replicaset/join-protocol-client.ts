export interface JoinProtocolResponse {
  [key: string]: number
}

export interface JoinProtocolClient {
  join(documentId: string, replicaId: string): Promise<JoinProtocolResponse>
}

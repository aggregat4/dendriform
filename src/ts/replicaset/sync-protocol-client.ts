export interface SyncProtocolResponse {}

export interface SyncProtocolClient {
  sync(): Promise<SyncProtocolResponse>
}

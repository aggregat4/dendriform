import {
  ClientAuthenticationError,
  IllegalClientServerStateError,
  JoinProtocolClient,
  JoinProtocolResponse,
  ServerNotAvailableError,
} from './join-protocol-client'

export class JoinProtocolHttpClient implements JoinProtocolClient {
  constructor(readonly serverEndpoint: string) {}

  async join(documentId: string, replicaId: string): Promise<JoinProtocolResponse> {
    try {
      const joinResponse = await fetch(
        `${this.serverEndpoint}documents/${documentId}/replicaset/${replicaId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      )
      if (joinResponse.status == 401) {
        throw new ClientAuthenticationError()
      }
      // we assume that a 404 basically doesn't happen: a new document should be treated as such
      // by the server, be automatically create and a replicaset started.
      // if we do get a 404 it's basically an indication that something is seriously screwed up
      // as we do for all the other 4xx status codes
      if (joinResponse.status >= 400 && joinResponse.status <= 499) {
        throw new IllegalClientServerStateError(
          `Illegal client/server state error detected when connecting to the server. The HTTP status code is ${joinResponse.status}`
        )
      }
      // all other http errors we will treat as the server being unavailable
      // since we deal with 4xx errors above and redirects are automatically handled,
      // these should only be 5xx errors
      if (!joinResponse.ok) {
        throw new ServerNotAvailableError(
          `Got an error code from the server that indicates it is not our fault: ${joinResponse.status}`
        )
      }
      return (await joinResponse.json()) as JoinProtocolResponse
    } catch (e) {
      console.error(
        `Unspecific network error when contacting join protocol server for document ${documentId} and replica ${replicaId}: `,
        e
      )
      throw new ServerNotAvailableError(
        `Got an unspecific network error from fetch, we are de facto offline: ${e.message}`
      )
    }
  }
}

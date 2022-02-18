import {
  ClientNotAuthorizedError,
  IllegalClientServerStateError,
  ServerNotAvailableError,
} from './join-protocol-client'

export async function performFetch(fetchFun: () => Promise<Response>): Promise<Response> {
  try {
    const response = await fetchFun()
    if (response.status == 401) {
      throw new ClientNotAuthorizedError()
    }
    // we assume that a 404 basically doesn't happen: a new document should be treated as such
    // by the server, be automatically create and a replicaset started.
    // if we do get a 404 it's basically an indication that something is seriously screwed up
    // as we do for all the other 4xx status codes
    if (response.status >= 400 && response.status <= 499) {
      throw new IllegalClientServerStateError(
        `Illegal client/server state error detected when connecting to the server. The HTTP status code is ${response.status}`
      )
    }
    // all other http errors we will treat as the server being unavailable
    // since we deal with 4xx errors above and redirects are automatically handled,
    // these should only be 5xx errors
    if (!response.ok) {
      throw new ServerNotAvailableError(
        `Got an error code from the server that indicates it is not our fault: ${response.status}`
      )
    }
    return response
  } catch (e) {
    console.error(`Unspecific network error when contacting server:`, e)
    throw new ServerNotAvailableError(
      `Got an unspecific network error from fetch, we are de facto offline: ${e.message}`
    )
  }
}

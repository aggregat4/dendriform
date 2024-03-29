/**
 * This groups all errors that indicate we can't assume a server is available.
 * Specifically:
 *
 * - 5xx errors of the server (who knows what's up)
 * - Actual offline state of the client
 */
export class ServerNotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerNotAvailableError'
  }
}

/** Requests to the server get rejected with authorization failed errors. */
export class ClientNotAuthorizedError extends Error {
  constructor() {
    super(`Client is not authorized`)
    this.name = 'ClientNotAuthorizedError'
  }
}

/**
 * This indicates that the server and the client are not in agreement and we
 * can't resolve the situation programmatically. This could only be resolved
 * with an update to the client and/or the server.
 */
export class IllegalClientServerStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IllegalClientServerStateError'
  }
}

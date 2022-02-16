export class ApplicationErrorCode {
  errorCode: string
  errorDetail: string
}

/**
 * This class models error that are of applicationwide relevance. They are meant
 * to potentially make it up to the UI so the user can be informed of them.
 *
 * For local error handling within a certain subsystem it is valid to have
 * separate Error hierarchies that are then at some point mapped to an
 * ApplicationError if they can not be handled locally.
 */
export class ApplicationError extends Error {
  constructor(readonly code: ApplicationErrorCode) {
    super(code.errorCode)
    this.name = 'ApplicationError'
  }
}

export const ERROR_JOIN_PROTOCOL_MISSING_LOCAL_CLOCK: ApplicationErrorCode = {
  errorCode: 'ERR-000100',
  errorDetail:
    'On joining a replicaset we were informed the server already knew our replicaId but have no knowledge of having joined the replicaset before. Client state is invalid.',
}

export const ERROR_JOIN_PROTOCOL_MISSING_SERVER_CLOCK: ApplicationErrorCode = {
  errorCode: 'ERR-000200',
  errorDetail:
    'On joining a replicaset the server does not know our replicaId but we believe we had joined the document replicaset before.',
}

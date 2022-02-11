export interface Error {
  errorCode: string
  errorDetail: string
}

export const ERROR_JOIN_PROTOCOL_MISSING_LOCAL_CLOCK: Error = {
  errorCode: 'ERR-000100',
  errorDetail:
    'On joining a replicaset we were informed the server already knew our replicaId but have no knowledge of having joined the replicaset before. Client state is invalid.',
}

export const ERROR_JOIN_PROTOCOL_MISSING_SERVER_CLOCK: Error = {
  errorCode: 'ERR-000200',
  errorDetail:
    'On joining a replicaset the server does not know our replicaId but we believe we had joined the document replicaset before.',
}

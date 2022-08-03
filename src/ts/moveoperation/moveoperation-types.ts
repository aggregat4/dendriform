import { atomIdent } from '../lib/modules/logootsequence'

export const enum NodeFlags {
  deleted = 1,
  collapsed = 2,
  completed = 4,
}

/**
 * This represents a node event, some fields have formats that are optimised for
 * storage and not for querying.
 *
 * The flags field is a bitmask that can be read using the NodeFlags enum.
 *
 * The created and updated timestamps are stored as the number of seconds since
 * the epoch because we don't need more than that accuracy and we save space.
 */
export interface NodeMetadata {
  name: string
  note: string
  /** Bitmask as per NodeFlags. */
  flags: number
  /** Creation timestamp in epoch seconds. */
  created: number
  /** Last updated timestamp in epoch seconds. */
  updated: number
  /** A logoot sequence position. */
  logootPos: atomIdent
}

export interface MoveOp {
  nodeId: string
  parentId: string
  replicaId: string
  clock: number
  metadata: NodeMetadata
}

export interface Replica {
  replicaId: string
  clock: number
}

export interface OperationMetadata extends NodeMetadata {
  nodeId: string
  parentId: string
}

/**
 * This the moveop we send to the server, it isn't interested in internal
 * information like the node id and parent id.
 * We move the specific information that we need into the metadata.
 */
export interface Operation {
  replicaId: string
  clock: number
  metadata: OperationMetadata
}

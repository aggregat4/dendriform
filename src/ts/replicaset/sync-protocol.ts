import {
  ApplicationErrorCode,
  ERROR_CLIENT_NOT_AUTHORIZED,
  ERROR_JOIN_PROTOCOL_CLIENT_ILLEGALSTATE,
  ERROR_SERVER_NOT_AVAILABLE,
  ERROR_UNKNOWN_CLIENT_SERVER_ERROR,
} from '../domain/errors'
import { LifecycleAware } from '../domain/lifecycle'
import { MoveOpTree } from '../moveoperation/moveoperation'
import { MoveOp, Operation } from '../moveoperation/moveoperation-types'
import { DocumentSyncRecord, IdbDocumentSyncStorage } from '../storage/idb-documentsyncstorage'
import { IdbReplicaStorage } from '../storage/idb-replicastorage'
import { BackoffWithJitterTimeoutStrategy, JobScheduler } from '../utils/jobscheduler'
import { assert } from '../utils/util'
import {
  ClientNotAuthorizedError,
  IllegalClientServerStateError,
  ServerNotAvailableError,
} from './client-server-errors'
import { JoinProtocol } from './join-protocol'
import { SyncProtocolClient, SyncProtocolPayload } from './sync-protocol-client'

/**
 * Protocol assumptions:
 *
 * - It is the client's responsibility to track the max clock that it has sent to
 *   the server.
 * - Client and Server MUST always send events in ascending clock value (per replica)
 * - Events are sent in batches that are limited in size. Clients determine server
 *   batchSize with a parameter.
 * - Client events that have a replicaId that are not part of the known replicaset
 *   will be rejected with a 400 Bad Request. The client must join first.
 */
export class SyncProtocol implements LifecycleAware {
  readonly #DEFAULT_DELAY_MS = 5000
  readonly #MAX_DELAY_MS = 60 * 1000
  readonly #syncJobScheduler = new JobScheduler(
    'Sync Protocol Scheduler',
    new BackoffWithJitterTimeoutStrategy(this.#DEFAULT_DELAY_MS, this.#MAX_DELAY_MS),
    this.synchronize.bind(this)
  )
  readonly #EVENT_BATCH_SIZE = 250

  #processingEvents = false
  #documentSyncRecord: DocumentSyncRecord = null
  #clientServerErrorState: ApplicationErrorCode = null

  constructor(
    readonly idbDocumentSyncStorage: IdbDocumentSyncStorage,
    readonly joinProtocol: JoinProtocol,
    readonly documentId: string,
    readonly moveOpTree: MoveOpTree,
    readonly client: SyncProtocolClient,
    readonly replicaStore: IdbReplicaStorage
  ) {}

  async init(): Promise<void> {
    await this.#syncJobScheduler.start(false)
  }

  async deinit(): Promise<void> {
    await this.#syncJobScheduler.stopAndWaitUntilDone()
  }

  private async synchronize() {
    // console.debug(`running synchronize`)
    if (!this.joinProtocol.hasJoinedReplicaSet() || this.#processingEvents) {
      return
    }
    try {
      this.#processingEvents = true
      // console.debug(`we have joined the replicaset and can sync`)
      if (!this.#documentSyncRecord) {
        const documentSyncRecord = await this.idbDocumentSyncStorage.loadDocument(this.documentId)
        assert(
          !!documentSyncRecord,
          `We have apparently joined the replicaset but we have no document sync record stored, this should not happen, aborting sync`
        )
        this.#documentSyncRecord = documentSyncRecord
      }
      const knownReplicaSet = await this.moveOpTree.getKnownReplicaSet()
      // console.debug(`last sent clock is ${this.#documentSyncRecord.lastSentClock}`)
      const operationsToSend = await this.moveOpTree.getLocalMoveOpsSince(
        this.#documentSyncRecord.lastSentClock,
        this.#EVENT_BATCH_SIZE
      )
      console.debug(
        `${operationsToSend.length} events to send from client ${this.replicaStore.getReplicaId()}`
      )
      let response: SyncProtocolPayload = null
      try {
        response = await this.client.sync(
          this.documentId,
          this.replicaStore.getReplicaId(),
          this.#EVENT_BATCH_SIZE,
          {
            operations: operationsToSend.map(moveOpToOperation),
            replicaSet: { replicas: knownReplicaSet },
          }
        )
        // make sure we clear any previous error we may have had
        this.#clientServerErrorState = null
      } catch (e) {
        const newLocal = e instanceof ClientNotAuthorizedError
        if (newLocal) {
          this.#clientServerErrorState = ERROR_CLIENT_NOT_AUTHORIZED
        } else if (e instanceof IllegalClientServerStateError) {
          this.#clientServerErrorState = ERROR_JOIN_PROTOCOL_CLIENT_ILLEGALSTATE
        } else if (e instanceof ServerNotAvailableError) {
          // this is fine, we are offline, we rethrow the exception so that the scheduler
          // can back off and try again in a bit
          this.#clientServerErrorState = ERROR_SERVER_NOT_AVAILABLE
          throw e
        } else {
          this.#clientServerErrorState = ERROR_UNKNOWN_CLIENT_SERVER_ERROR
          // What to do with unknown errors like this? This can't be many things anymore since
          // we catch as much as possible in the client implementation. We just rethrow and
          // let the backoff retry again. Maybe it will fix itself.
          throw e
        }
      }
      // if there were no errors we need to check whether we should update our last known sent clock and persist it
      if (operationsToSend.length > 0) {
        let newMaxClock = this.#documentSyncRecord.lastSentClock
        for (const sentEvent of operationsToSend) {
          if (sentEvent.clock > newMaxClock) {
            newMaxClock = sentEvent.clock
          }
        }
        assert(
          newMaxClock > this.#documentSyncRecord.lastSentClock,
          `We have just sent ${operationsToSend.length} events to the server but none of them had a clock higher than the one we had already sent before. This should never happen, clocks must increase monotonically.`
        )
        this.#documentSyncRecord.lastSentClock = newMaxClock
        await this.idbDocumentSyncStorage.saveDocument(this.#documentSyncRecord)
      }
      if (!!response) {
        console.debug(
          `Client ${this.replicaStore.getReplicaId()} got ${
            response.operations.length
          } events from server`
        )
        const serverOperations = response.operations.map(operationToMoveOp)
        for (const event of serverOperations) {
          await this.moveOpTree.applyMoveOp(event)
        }
        this.moveOpTree.processNewReplicaSet(response.replicaSet.replicas)
      }
    } catch (syncError) {
      console.error(`Error during sync: `, JSON.stringify(syncError))
      throw syncError
    } finally {
      this.#processingEvents = false
    }
  }

  getErrorState(): ApplicationErrorCode {
    return this.#clientServerErrorState
  }
}

function moveOpToOperation(moveop: MoveOp): Operation {
  return {
    replicaId: moveop.replicaId,
    clock: moveop.clock,
    metadata: {
      name: moveop.metadata.name,
      note: moveop.metadata.note,
      flags: moveop.metadata.flags,
      created: moveop.metadata.created,
      updated: moveop.metadata.updated,
      logootPos: moveop.metadata.logootPos,
      nodeId: moveop.nodeId,
      parentId: moveop.parentId,
    },
  }
}

function operationToMoveOp(op: Operation): MoveOp {
  return {
    nodeId: op.metadata.nodeId,
    parentId: op.metadata.parentId,
    replicaId: op.replicaId,
    clock: op.clock,
    metadata: {
      name: op.metadata.name,
      note: op.metadata.note,
      flags: op.metadata.flags,
      created: op.metadata.created,
      updated: op.metadata.updated,
      logootPos: op.metadata.logootPos,
    },
  }
}

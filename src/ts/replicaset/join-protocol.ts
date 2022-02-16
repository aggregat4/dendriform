import { DBSchema, IDBPDatabase, openDB } from 'idb'
import {
  ApplicationError,
  ERROR_JOIN_PROTOCOL_MISSING_LOCAL_CLOCK,
  ERROR_JOIN_PROTOCOL_MISSING_SERVER_CLOCK,
} from '../domain/errors'
import { LifecycleAware } from '../domain/lifecycle'
import { BackoffWithJitterTimeoutStrategy, JobScheduler } from '../utils/jobscheduler'
import { assert } from '../utils/util'
import { JoinProtocolClient } from './join-protocol-client'

interface JoinedDocumentRecord {
  documentId: string
  startClock: number
}

interface JoinedDocumentsSchema extends DBSchema {
  documents: {
    key: string
    value: JoinedDocumentRecord
  }
}

export class ClientHasNotJoinedReplicaSetError extends Error {
  constructor(readonly documentId: string) {
    super(`Client has not yet joined the replicaset for document "${documentId}"`)
    this.name = 'ClientHasNotJoinedReplicaSetError'
  }
}

/**
 * This class is responsible for implementing the remote join protocol for a
 * particular document. It keeps track of the start clock for this particular
 * document. This information also acts as an indicator that we have joined the
 * replicaset and that offline work on this document can proceed.
 *
 * Given a document id it can return the current start clock or none if the join
 * protocol was not executed yet. Using a backoff algorithm it will attempt to
 * join the replicaset for a particular document until it succeeds. We always
 * try to join with the server at least once. For subsequent join requests this
 * can help detect anomalous states between the client and the server.
 */
export class JoinProtocol implements LifecycleAware {
  private db: IDBPDatabase<JoinedDocumentsSchema>
  private readonly DEFAULT_DELAY_MS = 5000
  private readonly MAX_DELAY_MS = 60 * 1000

  private joinJobScheduler = new JobScheduler(
    new BackoffWithJitterTimeoutStrategy(this.DEFAULT_DELAY_MS, this.MAX_DELAY_MS),
    this.join.bind(this)
  )

  #startClock = -1
  #clientAndServerStateConsistencyError = null

  constructor(
    readonly dbName: string,
    readonly documentId: string,
    readonly replicaId: string,
    readonly client: JoinProtocolClient
  ) {}

  async init() {
    this.db = await openDB<JoinedDocumentsSchema>(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore('documents', {
          keyPath: 'documentId',
          autoIncrement: false,
        })
      },
    })
    const document = await this.loadDocument()
    if (document) {
      // we initially prefill the local startclock with the saved value
      // if there is one. this will allow us to start editing offline
      // while this protocol tries to contact the server
      // It may mean that at a later point in time we detect a discrepancy
      // with the server and have to return some errors
      this.#startClock = document.startClock
    }
    await this.joinJobScheduler.start(true)
  }

  async deinit() {
    if (this.db) {
      this.db.close()
      this.db = null
    }
    this.joinJobScheduler.stop()
  }

  private async loadDocument(): Promise<JoinedDocumentRecord> {
    return await this.db.get('documents', this.documentId)
  }

  private async saveDocument() {
    assert(
      this.#startClock > -1,
      `If you store the current document you need to have a valid startClock`
    )
    return await this.db.put('documents', {
      documentId: this.documentId,
      startClock: this.#startClock,
    })
  }

  private async join() {
    try {
      const joinResponse = await this.client.join(this.documentId, this.replicaId)
      // Now we have a bunch of potential error and non-error cases:
      if (this.#startClock == -1 && !joinResponse.alreadyKnown) {
        // OK: we are a fresh replica and the server doesn't know us, all is well
        this.#startClock = joinResponse.startClock
        await this.saveDocument()
      } else if (this.#startClock == -1 && joinResponse.alreadyKnown) {
        // ERROR: we believe we are a fresh replica but the server already knows us
        this.#clientAndServerStateConsistencyError = ERROR_JOIN_PROTOCOL_MISSING_LOCAL_CLOCK
      } else if (this.#startClock > -1 && !joinResponse.alreadyKnown) {
        // ERROR: we believe we have already joined the replicaset but the server does not know us
        this.#clientAndServerStateConsistencyError = ERROR_JOIN_PROTOCOL_MISSING_SERVER_CLOCK
      } else if (this.#startClock > -1 && joinResponse.alreadyKnown) {
        // OK: we think we are part of the replicaset and the server thinks so as well
        //
        // Theoretically we could have the problem that the server does not have some of our events
        // but we will resolve this in the sync protocol: it will check what the server knows of us
        // and we will send all missing messages. If messages are missing in the middle of the sequence
        // well, there is nothing we can do about that, and also no way to detect that.
      }
      // No matter what state we are in after a successful request to the server,
      // we need to stop the scheduler
      this.joinJobScheduler.stop()
    } catch (e) {
      // TODO: sensibly deal with server errors, we probably need to log something and store some state on the server?
      // If 5xx then we are more or less in offline mode
      // if 4xx its our fault and maybe we could differentiate between a few cases (auth, bad request, not found)
      console.error(`Error from server on join protocol request: `, e)
      // TODO: only rethrow if we want the scheduler to backoff on the next attempt, so basically only rethrow
      // if offline or 5xx comes back from server? Can we detect offline or connection issue? Or just rethrow if
      // it is _NOT_ a 4xx?
      throw e
    }
  }

  /**
   * Indicates whether we have joined a replicaset or not. It does this by
   * checking that we have a valid start clock.
   *
   * @throws ApplicationError if we are in a state that can not be resolved and
   *   that indicates a serious error in the client or server.
   */
  hasJoinedReplicaSet(): boolean {
    if (this.#clientAndServerStateConsistencyError !== null) {
      throw new ApplicationError(this.#clientAndServerStateConsistencyError)
    }
    return this.#startClock > -1
  }

  /**
   * @returns The startclock for the documentId that this protocol was initialised with.
   * @throws ClientHasNotJoinedReplicaSetError when the client has not yet
   *   joined the replicaset for this document.
   * @throws ApplicationError if we are in a state that can not be resolved and
   *   that indicates a serious error in the client or server.
   */
  getStartClock(): number {
    if (this.#clientAndServerStateConsistencyError !== null) {
      throw new ApplicationError(this.#clientAndServerStateConsistencyError)
    }
    if (!this.hasJoinedReplicaSet()) {
      throw new ClientHasNotJoinedReplicaSetError(this.documentId)
    }
    return this.#startClock
  }
}

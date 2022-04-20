import {
  ApplicationError,
  ApplicationErrorCode,
  ERROR_CLIENT_NOT_AUTHORIZED,
  ERROR_JOIN_PROTOCOL_CLIENT_ILLEGALSTATE,
  ERROR_JOIN_PROTOCOL_MISSING_LOCAL_CLOCK,
  ERROR_JOIN_PROTOCOL_MISSING_SERVER_CLOCK,
} from '../domain/errors'
import { LifecycleAware } from '../domain/lifecycle'
import { IdbDocumentSyncStorage } from '../storage/idb-documentsyncstorage'
import { IdbReplicaStorage } from '../storage/idb-replicastorage'
import { BackoffWithJitterTimeoutStrategy, JobScheduler } from '../utils/jobscheduler'
import { Signal } from '../utils/util'
import {
  ClientNotAuthorizedError,
  IllegalClientServerStateError,
  ServerNotAvailableError,
} from './client-server-errors'
import { JoinProtocolClient } from './join-protocol-client'

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
  readonly #onJoinReplicaSet = new Signal<JoinProtocol, string>()
  readonly #DEFAULT_DELAY_MS = 1000
  readonly #MAX_DELAY_MS = 60 * 1000
  readonly #joinJobScheduler = new JobScheduler(
    new BackoffWithJitterTimeoutStrategy(this.#DEFAULT_DELAY_MS, this.#MAX_DELAY_MS),
    this.join.bind(this)
  )

  #hasJoinedReplicaSet = false
  #clientServerErrorState: ApplicationErrorCode = null

  constructor(
    readonly idbDocumentSyncStorage: IdbDocumentSyncStorage,
    readonly documentId: string,
    readonly replicaStore: IdbReplicaStorage,
    readonly client: JoinProtocolClient,
    readonly joinImmediately: boolean = false
  ) {}

  async init() {
    const document = await this.idbDocumentSyncStorage.loadDocument(this.documentId)
    if (document) {
      // we initially prefill the local startclock with the saved value
      // if there is one. this will allow us to start editing offline
      // while this protocol tries to contact the server
      // It may mean that at a later point in time we detect a discrepancy
      // with the server and have to return some errors
      this.#hasJoinedReplicaSet = document.hasJoinedReplicaSet
    }
    // we explicitly do not want to start immediately polling the server
    // this allows for faster initialisation and we we will notify listeners
    // as soon as we are ready
    await this.#joinJobScheduler.start(this.joinImmediately)
  }

  async deinit() {
    await this.#joinJobScheduler.stopAndWaitUntilDone()
  }

  public get JoinEvent(): Signal<JoinProtocol, string> {
    return this.#onJoinReplicaSet
  }

  private async join() {
    // console.debug(`executing join() on JoinProtocol`)
    let response = null
    try {
      response = await this.client.join(this.documentId, this.replicaStore.getReplicaId())
    } catch (e) {
      if (e instanceof ClientNotAuthorizedError) {
        this.#clientServerErrorState = ERROR_CLIENT_NOT_AUTHORIZED
      } else if (e instanceof IllegalClientServerStateError) {
        this.#clientServerErrorState = ERROR_JOIN_PROTOCOL_CLIENT_ILLEGALSTATE
      } else if (e instanceof ServerNotAvailableError) {
        // this is fine, we are offline, we rethrow the exception so that the scheduler
        // can back off and try again in a bit
        throw e
      } else {
        // What to do with unknown errors like this? This can't be many things anymore since
        // we catch as much as possible in the client implementation. We just rethrow and
        // let the backoff retry again. Maybe it will fix itself.
        throw e
      }
    }
    if (response != null) {
      // Now we have a bunch of potential error and non-error cases:
      if (!this.#hasJoinedReplicaSet && !response.alreadyKnown) {
        // OK: we are a fresh replica and the server doesn't know us, all is well
        // console.debug(`We are initialising our clock since we joined the replicaset fresh!`)
        await this.idbDocumentSyncStorage.saveDocument({
          documentId: this.documentId,
          hasJoinedReplicaSet: true,
          lastSentClock: -1,
        })
        this.#hasJoinedReplicaSet = true
      } else if (!this.#hasJoinedReplicaSet && response.alreadyKnown) {
        // ERROR: we believe we are a fresh replica but the server already knows us
        this.#clientServerErrorState = ERROR_JOIN_PROTOCOL_MISSING_LOCAL_CLOCK
      } else if (this.#hasJoinedReplicaSet && !response.alreadyKnown) {
        // ERROR: we believe we have already joined the replicaset but the server does not know us
        this.#clientServerErrorState = ERROR_JOIN_PROTOCOL_MISSING_SERVER_CLOCK
      } else if (this.#hasJoinedReplicaSet && response.alreadyKnown) {
        // OK: we think we are part of the replicaset and the server thinks so as well
        //
        // Theoretically we could have the problem that the server does not have some of our events
        // but we will resolve this in the sync protocol: it will check what the server knows of us
        // and we will send all missing messages. If messages are missing in the middle of the sequence
        // well, there is nothing we can do about that, and also no way to detect that.
      }
    }
    // No matter what state we are in after a request to the server where we have not thrown an exception,
    // we need to stop the scheduler
    this.#joinJobScheduler.stop()
    this.#onJoinReplicaSet.trigger(this, 'replicaset-status-changed')
  }

  /**
   * Indicates whether we have joined a replicaset or not. It does this by
   * checking that we have a valid start clock.
   *
   * @throws ApplicationError if we are in a state that can not be resolved and
   *   that indicates a serious error in the client or server.
   */
  hasJoinedReplicaSet(): boolean {
    if (!!this.#clientServerErrorState) {
      throw new ApplicationError(this.#clientServerErrorState)
    }
    return this.#hasJoinedReplicaSet
  }
}

import { LifecycleAware } from '../domain/lifecycle'

/**
 * This class is responsible for implementing the remote join protocol for a particular document.
 * It keeps track of the start clock for a particular document.
 * Given a document id it can return the current start clock or none if the join protocol
 * was not executed yet.
 * Using a backoff algorithm it will attempt to join the replicaset for a particular document
 * until it succeeds.
 */
export class JoinProtocol implements LifecycleAware {
  constructor(readonly documentId: string) {}
  init(): Promise<void> {
    // TODO: implement database init (use one table with documentid,startclock ? so other joinprotocol instances for other documents can also use it)
    // TODO: start the remote join attempts if we don't have a start clock yet
    // shut down the remote join attempts as soon as we have a start clock
    throw new Error('Method not implemented.')
  }
  deinit(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  getStartClock(): number {
    throw new Error('Not implemented yet')
  }
}

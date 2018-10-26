import { DEventLog, DEvent, EventSubscriber, Events, EventType } from './eventlog'

/**
 * A remote event log is a proxy to an actual server based instance of an event log.
 * It is only meant to synchronize events and thus only implements the DEventLog interface.
 *
 * A remote eventlog assumes that the server is running on the same origin.
 */
export class EventSyncServer {

  constructor(private readonly relativeUrl: string) {}

}

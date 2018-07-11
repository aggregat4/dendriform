import {EventLog} from './eventlog'

/**
 * An EventPump continuosly pumps events from A to B and from B to A to
 * allow them to eventually converge on the same state. One of the logs
 * will typically be a remote server side implementation that gathers
 * events from all other peers in the system.
 *
 * For each eventlog it keeps track of what the last known counter is
 * that it has gotten events for. That counter is persisted. If the
 * EventPump's counter is larger than the server counter, it will
 * reset its counter and get all the events again since this may
 * indicate that the eventlog was reset.
 */
class EventPump {
  constructor(
    private readonly eventLogA: EventLog,
    private readonly eventLogB: EventLog) {}

  start() {
    // TODO: init local persistence for eventlog ids when not available, start pumping
  }

  stop() {
    // TODO:
  }
}

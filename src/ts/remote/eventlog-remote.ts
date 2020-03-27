import { DEvent, Events } from '../eventlog/eventlog'
import { assertNonEmptyString } from '../utils/util'
import { deserializeServerEvents, serializeServerEvent } from './serialization'

export class RemoteEventLog {

  readonly serverEndpoint: string

  constructor(
      serverEndpoint: string,
      private readonly eventlogId: string) {
    this.serverEndpoint = this.normalizeUrl(serverEndpoint)
  }

  private normalizeUrl(url: string): string {
    if (!url.endsWith('/')) {
      return url + '/'
    } else {
      return url
    }
  }

  async publishEvents(events: DEvent[]): Promise<any> {
    return fetch(`${this.serverEndpoint}eventlogs/${this.eventlogId}/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(events.map(serializeServerEvent)),
      })
      // .catch(error => {
      // })
  }

  /**
   * TODO: error handling!
   */
  async getEventsSince(counter: number, peerIdExclusionFilter: string, batchSize: number): Promise<Events> {
    assertNonEmptyString(peerIdExclusionFilter)
    return fetch(`${this.serverEndpoint}eventlogs/${this.eventlogId}/?since=${counter}&notForOriginator=${peerIdExclusionFilter}&batchSize=${batchSize}`)
      .then(response => response.json())
      .then(serverEvents => {
        return {
          counter: serverEvents.counter,
          events: deserializeServerEvents(serverEvents.events),
        }
      })
  }

}

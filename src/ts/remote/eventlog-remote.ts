import { DEvent, Events } from '../eventlog/eventlog'
import { assertNonEmptyString } from '../util'
import { deserializeServerEvents, serializeServerEvent } from './serialization'

export class RemoteEventLog<T> {

  readonly serverEndpoint: string

  constructor(
      serverEndpoint: string,
      private readonly eventlogId: string,
      // private readonly payloadSerializer: (T) => any,
      private readonly payloadDeserializer: (any) => T) {
    this.serverEndpoint = this.normalizeUrl(serverEndpoint)
  }

  private normalizeUrl(url: string): string {
    if (!url.endsWith('/')) {
      return url + '/'
    } else {
      return url
    }
  }

  async publishEvents(events: Array<DEvent<T>>): Promise<any> {
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
  async getEventsSince(counter: number, peerIdExclusionFilter: string): Promise<Events<T>> {
    assertNonEmptyString(peerIdExclusionFilter)
    return fetch(`${this.serverEndpoint}eventlogs/${this.eventlogId}/?since=${counter}&notForOriginator=${peerIdExclusionFilter}`)
      .then((response) => {
        return response.json()
      })
      .then((serverEvents) => {
        return {
          counter: serverEvents.counter,
          events: deserializeServerEvents<T>(serverEvents.events, this.payloadDeserializer),
        }
      })
  }

}

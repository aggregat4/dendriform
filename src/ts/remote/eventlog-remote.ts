// import { serializeServerEvent, ServerEvents, deserializeServerEvents } from './serialization'
// import { DEvent, Events } from '../storage/nodestorage'
// import { assertNonEmptyString } from '../utils/util'

// type ServerState = { [key: string]: number }

// export class RemoteEventLog {
//   readonly serverEndpoint: string

//   constructor(serverEndpoint: string, private readonly eventlogId: string) {
//     this.serverEndpoint = this.normalizeUrl(serverEndpoint)
//   }

//   private normalizeUrl(url: string): string {
//     if (!url.endsWith('/')) {
//       return url + '/'
//     } else {
//       return url
//     }
//   }

//   async fetchServerState(): Promise<ServerState> {
//     const response = await fetch(`${this.serverEndpoint}eventlogs/${this.eventlogId}/state`)
//     return (await response.json()) as ServerState
//   }

//   async publishEvents(events: DEvent[]): Promise<void> {
//     await fetch(`${this.serverEndpoint}eventlogs/${this.eventlogId}/`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json; charset=utf-8',
//       },
//       body: JSON.stringify(events.map(serializeServerEvent)),
//     })
//     // .catch(error => {
//     // })
//   }

//   async getEventsSince(counter: number, originator: string, batchSize: number): Promise<Events> {
//     assertNonEmptyString(originator)
//     const response = await fetch(
//       `${this.serverEndpoint}eventlogs/${this.eventlogId}/?since=${counter}&originator=${originator}&batchSize=${batchSize}`
//     )
//     const serverEvents = (await response.json()) as ServerEvents
//     return {
//       counter: serverEvents.counter,
//       events: deserializeServerEvents(serverEvents.events),
//     }
//   }
// }

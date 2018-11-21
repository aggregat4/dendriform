import { DEvent, Events } from './eventlog'

export class RemoteEventLog<T> {

  constructor(private readonly serverEndpoint: string) {}

  async insertEvents(events: Array<DEvent<T>>): Promise<void> {

  }

  async getEventsSince(counter: number, peerIdExclusionFilter: string): Promise<Events<T>> {

  }

}

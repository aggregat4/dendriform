import { openDB, IDBPDatabase } from 'idb'
import { LifecycleAware } from '../domain/domain'
import { EventType } from './eventlog'
import {
  EventStoreSchema,
  PeerIdAndEventIdKeyType,
  PeerMetadata,
  StoredEvent,
} from './eventlog-storedevent'

export class IdbEventRepository implements LifecycleAware {
  private db: IDBPDatabase<EventStoreSchema>

  constructor(readonly dbName: string) {}

  async init(): Promise<void> {
    try {
      this.db = await openDB<EventStoreSchema>(this.dbName, 1, {
        upgrade(db) {
          db.createObjectStore('peer', {
            keyPath: 'eventlogid',
            autoIncrement: false,
          })
          const eventsStore = db.createObjectStore('events', {
            keyPath: 'eventid',
            autoIncrement: false, // we generate our own keys, this is required since compound indexes with an auto-incremented key do not work everywhere (yet)
          })
          eventsStore.createIndex('eventid', 'eventid')
          eventsStore.createIndex('eventtype', 'eventtype')
          eventsStore.createIndex('eventtype-and-treenodeid', ['eventtype', 'treenodeid'])
          eventsStore.createIndex('peerid-and-eventid', ['peerid', 'eventid'])
        },
      })
    } catch (error) {
      console.error(
        `Error initialising indexeddb eventlog, note that Firefox does not (yet) allow IndexedDB in private browsing mode: `,
        error
      )
    }
  }

  async deinit(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  getName(): string {
    return this.dbName
  }

  async storeEvents(events: StoredEvent[], storeCallback: (event: StoredEvent) => void) {
    const tx = this.db.transaction('events', 'readwrite')
    try {
      // This is an efficient bulk add that does not wait for the success callback, inspired by
      // https://github.com/dfahlander/Dexie.js/blob/fb735811fd72829a44c86f82b332bf6d03c21636/src/dbcore/dbcore-indexeddb.ts#L161
      let i = 0
      let lastEvent = null
      for (; i < events.length; i++) {
        lastEvent = events[i]
        // we only need to wait for onsuccess if we are interested in generated keys, and we are not since they are pregenerated
        await tx.store.add(lastEvent)
        storeCallback(lastEvent)
      }
      return tx.done
    } catch (error) {
      console.error(`store error: `, error)
    }
  }

  async loadPeerMetadata(): Promise<PeerMetadata> {
    return this.db.getAll('peer').then(async (peerMetadata) => {
      if (!peerMetadata || peerMetadata.length === 0) {
        return null
      } else {
        return peerMetadata[0]
      }
    })
  }

  async getMaxEventId(): Promise<number> {
    const tx = this.db.transaction('events', 'readonly')
    const cursor = await tx.store.index('eventid').openCursor(null, 'prev')
    if (cursor) {
      return cursor.value.eventid
    } else {
      return -1
    }
  }

  async storePeerMetadata(metadata: PeerMetadata) {
    const tx = this.db.transaction('peer', 'readwrite')
    try {
      await tx.store.put(metadata)
    } catch (e) {
      console.error(e)
    }
  }

  async loadEventsSince(lowerBound: PeerIdAndEventIdKeyType, upperBound: PeerIdAndEventIdKeyType) {
    const range = IDBKeyRange.bound(lowerBound, upperBound, true, true) // do not include lower and upper bounds themselves (open interval)
    return await this.db.getAllFromIndex('events', 'peerid-and-eventid', range)
  }

  async loadEventsFromType(eventType: EventType) {
    return await this.db.getAllFromIndex('events', 'eventtype', eventType)
  }

  async loadStoredEvents(eventType: EventType, nodeId: string): Promise<StoredEvent[]> {
    return await this.db.getAllFromIndex('events', 'eventtype-and-treenodeid', [eventType, nodeId])
  }
}

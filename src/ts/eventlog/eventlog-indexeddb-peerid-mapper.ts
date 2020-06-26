import { VectorClock, VectorClockValuesType } from '../lib/vectorclock'
import { DEvent } from './eventlog'
import { StoredEvent } from './eventlog-storedevent'
import { DBSchema, IDBPDatabase, openDB } from 'idb'

interface PeerIdMapping {
  externalid: string,
  internalid: number,
}

interface PeerIdMappingSchema extends DBSchema {
  'peerid-mapping': {
    key: string,
    value: PeerIdMapping,
  }
}

export class LocalEventLogIdMapper {
  private db: IDBPDatabase<PeerIdMappingSchema>
  private externalToInternalIdMap: Map<string, number>
  private internalToExternalIdMap: Map<number, string>

  constructor(readonly dbName: string) {}

  async init(): Promise<void> {
    this.db = await openDB<PeerIdMappingSchema>(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore('peerid-mapping', {
          keyPath: 'externalid',
          autoIncrement: false,
        })
      },
    })
    await this.loadPeerIdMapping()
  }

  deinit(): void {
    this.db.close()
  }

  private async loadPeerIdMapping(): Promise<void> {
    const mappings = await this.db.getAll('peerid-mapping')
    this.externalToInternalIdMap = new Map<string, number>()
    this.internalToExternalIdMap = new Map<number, string>()
    for (const mapping of mappings) {
      this.externalToInternalIdMap.set(mapping.externalid, mapping.internalid)
      this.internalToExternalIdMap.set(mapping.internalid, mapping.externalid)
    }
  }

  private async savePeerIdMapping(): Promise<void> {
    const mappings = []
    for (const [key, value] of this.externalToInternalIdMap.entries()) {
      const mapping = {externalid: key, internalid: value}
      mappings.push(mapping)
      await this.db.put('peerid-mapping', mapping)
    }
  }

  storedEventToDEventMapper(ev: StoredEvent): DEvent {
    return new DEvent(
      ev.localId,
      ev.eventtype,
      this.internalToExternalPeerId(Number(ev.peerid)),
      new VectorClock(this.internalToExternalVectorclockValues(ev.vectorclock)),
      ev.treenodeid,
      ev.payload)
  }

  private findNextInternalId(): number {
    let largestId = 0
    for (const key of this.internalToExternalIdMap.keys()) {
      if (key > largestId) {
        largestId = key
      }
    }
    return largestId + 1
  }

  async externalToInternalPeerId(externalId: string): Promise<number> {
    const existingMapping = this.externalToInternalIdMap.get(externalId)
    if (!existingMapping) {
      const newInternalId = this.findNextInternalId()
      this.externalToInternalIdMap.set(externalId, newInternalId)
      this.internalToExternalIdMap.set(newInternalId, externalId)
      await this.savePeerIdMapping()
      return newInternalId
    } else {
      return existingMapping
    }
  }

  private internalToExternalPeerId(internalId: number): string {
    const existingExternalId = this.internalToExternalIdMap.get(internalId)
    if (!existingExternalId) {
      throw Error(`Invalid internalId ${internalId}`)
    } else {
      return existingExternalId
    }
  }

  /**
   * @returns A vectorclock where all node ids have been mapped from external UUIDs to
   * internal number ids. This never throws since an unknown nodeId is just added to the map.
   */
  async externalToInternalVectorclockValues(externalClockValues: VectorClockValuesType): Promise<VectorClockValuesType> {
    const internalValues = {}
    for (const externalNodeId of Object.keys(externalClockValues)) {
      internalValues[await this.externalToInternalPeerId(externalNodeId)] = externalClockValues[externalNodeId]
    }
    return internalValues
  }

  /**
   * @returns A vectorclock where all node ids have been mapped from internal numbers to
   * external UUIDs. This function throws when the internal id is unknown.
   */
  private internalToExternalVectorclockValues(internalClockValues: VectorClockValuesType): VectorClockValuesType {
    const externalValues = {}
    for (const internalNodeId of Object.keys(internalClockValues)) {
      externalValues[this.internalToExternalPeerId(Number(internalNodeId))] = internalClockValues[internalNodeId]
    }
    return externalValues
  }
}

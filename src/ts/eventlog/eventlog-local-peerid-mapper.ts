import Dexie from 'dexie'
import { VectorClock } from '../lib/vectorclock'
import { StoredEvent } from './eventlog-local'
import { DEvent } from './eventlog'

export class LocalEventLogIdMapper {
  readonly db: Dexie
  private externalToInternalIdMap: Map<string, number>
  private internalToExternalIdMap: Map<number, string>

  constructor(readonly dbName: string) {
    this.db = new Dexie(dbName)
  }

  async init(): Promise<void> {
    this.db.version(1).stores({
      peerid_mapping: 'externalid', // columns: externalid, internalid
    })
    await this.db.open()
    await this.loadPeerIdMapping()
  }

  private async loadPeerIdMapping() {
    return this.db.table('peerid_mapping').toArray().then(mappings => {
      this.externalToInternalIdMap = new Map()
      this.internalToExternalIdMap = new Map()
      for (const mapping of mappings) {
        this.externalToInternalIdMap.set(mapping.externalid, mapping.internalid)
        this.internalToExternalIdMap.set(mapping.internalid, mapping.externalid)
      }
    })
  }

  private async savePeerIdMapping() {
    const mappings = []
    for (const [key, value] of this.externalToInternalIdMap.entries()) {
      mappings.push({externalid: key, internalid: value})
    }
    return this.db.table('peerid_mapping').bulkPut(mappings)
      .catch(error => console.error(`savePeerIdMapping error: `, error))
  }

  storedEventToDEventMapper(ev: StoredEvent): DEvent {
    return new DEvent(
      ev.eventtype,
      this.internalToExternalPeerId(Number(ev.peerid)),
      this.internalToExternalVectorclock(ev.vectorclock),
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

  externalToInternalPeerId(externalId: string): number {
    const existingMapping = this.externalToInternalIdMap.get(externalId)
    if (!existingMapping) {
      const newInternalId = this.findNextInternalId()
      this.externalToInternalIdMap.set(externalId, newInternalId)
      this.internalToExternalIdMap.set(newInternalId, externalId)
      this.savePeerIdMapping()
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
  externalToInternalVectorclock(externalClock: VectorClock): VectorClock {
    const externalValues = externalClock.values
    const internalValues = {}
    for (const externalNodeId of Object.keys(externalValues)) {
      internalValues[this.externalToInternalPeerId(externalNodeId)] = externalValues[externalNodeId]
    }
    return new VectorClock(internalValues)
  }

  /**
   * @returns A vectorclock where all node ids have been mapped from internal numbers to
   * external UUIDs. This function throws when the internal id is unknown.
   */
  private internalToExternalVectorclock(internalClock: VectorClock): VectorClock {
    const internalValues = internalClock.values
    const externalValues = {}
    for (const internalNodeId of Object.keys(internalValues)) {
      externalValues[this.internalToExternalPeerId(Number(internalNodeId))] = internalValues[internalNodeId]
    }
    return new VectorClock(externalValues)
  }
}

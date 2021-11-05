import { DBSchema, IDBPDatabase, openDB } from 'idb'

interface PeerIdMapping {
  externalid: string
  internalid: number
}

interface PeerIdMappingSchema extends DBSchema {
  'peerid-mapping': {
    key: string
    value: PeerIdMapping
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
      const mapping = { externalid: key, internalid: value }
      mappings.push(mapping)
      await this.db.put('peerid-mapping', mapping)
    }
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

  internalToExternalPeerId(internalId: number): string {
    const existingExternalId = this.internalToExternalIdMap.get(internalId)
    if (!existingExternalId) {
      throw Error(`Invalid internalId ${internalId}`)
    } else {
      return existingExternalId
    }
  }
}

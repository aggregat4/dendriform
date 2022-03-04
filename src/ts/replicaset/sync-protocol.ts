import { MoveOpTree } from '../moveoperation/moveoperation'
import { SyncProtocolClient } from './sync-protocol-client'

export class SyncProtocol {
  constructor(readonly moveOpTree: MoveOpTree, readonly client: SyncProtocolClient) {}
}

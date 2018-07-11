/**
 * This is a repository implementation that uses an event log that synchronises with a remote eventlog
 * to provide an eventually consistent, multi-peer, storage backend.
 */
import {Repository} from './repository'

export class EventlogRepository implements Repository {
  // createNode(id: string, name: string, content: string): Promise<RepositoryNode>
  // updateNode(node: RepositoryNode): Promise<void>
  // reparentNode(childId: string, parentId: string, position: RelativeNodePosition): Promise<void>

  // getChildIds(nodeId: string): Promise<string[]>
  // getParentId(nodeId: string): Promise<string>

  // loadNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode>
  // loadTree(nodeId: string): Promise<LoadedTree>

}

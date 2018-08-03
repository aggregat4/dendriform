/**
 * This is a repository implementation that uses an event log that synchronises with a remote eventlog
 * to provide an eventually consistent, multi-peer, storage backend.
 */
import {Repository} from './repository'
import { AddOrUpdateNodeEventPayload, DEventLog, DEventSource, EventType } from '../eventlog/eventlog'
import { ReparentNodeByIdCommandPayload } from '../commands/commands'
import { Predicate } from '../util'
import { LoadedTree, RepositoryNode, RelativeNodePosition } from '../domain/domain'

export class EventlogRepository implements Repository {

  constructor(readonly nodeEventLog: DEventLog<AddOrUpdateNodeEventPayload> &
                                     DEventSource<AddOrUpdateNodeEventPayload>,
              readonly treeEventLog: DEventLog<ReparentNodeByIdCommandPayload> &
                                     DEventSource<ReparentNodeByIdCommandPayload>) {}

  createNode(id: string, name: string, content: string): Promise<void> {
    return this.nodeEventLog.publish(
      EventType.ADD_OR_UPDATE_NODE,
      id,
      {name, note: content, deleted: false, collapsed: false})
  }

  updateNode(node: RepositoryNode): Promise<void> {
    return this.nodeEventLog.publish(
      EventType.ADD_OR_UPDATE_NODE,
      node._id,
      {name, note: node.content, deleted: !!node.deleted, collapsed: !!node.collapsed})
  }

  reparentNode(childId: string, parentId: string, position: RelativeNodePosition): Promise<void> {
    
  }

  getChildIds(nodeId: string): Promise<string[]>
  getParentId(nodeId: string): Promise<string>
  loadNode(nodeId: string, nodeFilter: Predicate): Promise<RepositoryNode>
  loadTree(nodeId: string, nodeFilter: Predicate): Promise<LoadedTree>
}

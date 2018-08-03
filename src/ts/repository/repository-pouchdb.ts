import PouchDB from 'pouchdb-browser'
import {
  RepositoryNode,
  ResolvedRepositoryNode,
  LoadedTree,
  State,
  RelativeNodePosition,
  RelativeLinearPosition,
  nodeIsNotDeleted,
} from '../domain/domain'
import {Repository} from './repository'
import { Predicate, ALWAYS_TRUE } from '../util'

interface PouchDbRepositoryNode extends RepositoryNode {
  childrefs: string[],
  parentref: string,
}

export class PouchDbRepository implements Repository {
  private readonly outlineDb: any = new PouchDB('outlineDB')

  createNode(id: string, name: string, content: string): Promise<void> {
    const node = {
      _id: id,
      name,
      content,
      childrefs: [],
    }
    return this.outlineDb.post(node)
  }

  updateNode(node: RepositoryNode, retryCount?: number): Promise<void> {
    // console.log(`Putting node: '${JSON.stringify(node)}'`)
    return this.outlineDb.put(node)
      .catch((err) => {
        // tslint:disable-next-line:no-console
        console.log(`ERROR handler for putNode for new name "${node._id}": ${JSON.stringify(err)}`)
        // TODO we are naively just retrying when we get an update conflict, not sure this is never an infinite loop
        // TODO evaluate whether to use the upsert plugin for this? https://github.com/pouchdb/upsert
        const retries = retryCount || 0
        if (err.status === 409 && retries <= 25) {
          this.updateNode(node, retries + 1)
        }
      })
  }

  /**
   * if old parent exists:
   *   load old parent
   *     remove child from parent
   *     save old parent
   * set parentref in child to new parent id
   *   save child
   * load new parent
   *   add child to childrefs at correct position
   *   save new parent
   */
  reparentNode(childId: string, parentId: string, position: RelativeNodePosition): Promise<void> {
    return this.pdbLoadNode(childId, nodeIsNotDeleted).then(child => {
      // remove child from old parent
      const oldParentUpdatePromise = child.parentref
        ? this.loadNode(child.parentref, nodeIsNotDeleted).then(oldParentNode => {
          const pouchDbParent = oldParentNode as PouchDbRepositoryNode
          pouchDbParent.childrefs = pouchDbParent.childrefs.filter(c => c !== child._id)
          return this.updateNode(oldParentNode)
        })
        : Promise.resolve()
      // set new parent in child
      return oldParentUpdatePromise.then(() => {
          child.parentref = parentId
          return this.updateNode(child)
        })
      // add child to new parent
        .then(() => this.pdbLoadNode(parentId, nodeIsNotDeleted))
        .then(newParentNode => {
          newParentNode.childrefs = this.mergeNodeIds(newParentNode.childrefs || [], [child._id], position)
          return this.updateNode(newParentNode)
        })
    })
  }

  private mergeNodeIds(originalChildIds: string[], newChildIds: string[], position: RelativeNodePosition): string[] {
    if (position.beforeOrAfter === RelativeLinearPosition.END) {
      return originalChildIds.concat(newChildIds)
    } else if (position.beforeOrAfter === RelativeLinearPosition.BEGINNING) {
      return newChildIds.concat(originalChildIds)
    } else { // RelativeLinearPosition.AFTER
      const pos = originalChildIds.indexOf(position.nodeId)
      if (pos !== -1) {
        return originalChildIds.slice(0, pos + 1).concat(newChildIds, originalChildIds.slice(pos + 1))
      } else {
        // this should really not happen
        // tslint:disable-next-line:no-console
        console.error(`Trying to put nodes at position ${position.beforeOrAfter} of a
                       node '${position.nodeId}' that does not exist`)
        // but just put them at the end (graceful degradation?)
        return originalChildIds.concat(newChildIds)
      }
    }
  }

  getChildIds(nodeId: string): Promise<string[]> {
    return this.pdbLoadNode(nodeId, ALWAYS_TRUE).then(node => node.childrefs)
  }

  getParentId(nodeId: string): Promise<string> {
    return this.pdbLoadNode(nodeId, ALWAYS_TRUE).then(node => node.parentref)
  }

loadNode(nodeId: string, nodeFilter: Predicate): Promise<RepositoryNode> {
    return this.pdbLoadNode(nodeId, nodeFilter)
  }

  // returns a promise of a node, you can determine whether to include deleted or not
  private pdbLoadNode(nodeId: string, nodeFilter: Predicate): Promise<PouchDbRepositoryNode> {
    // console.log(`cdbLoadNode for id '${nodeId}'`)
    return this.outlineDb.get(nodeId).then(node => {
      // if (node.deleted && node.deleted === true && !includeDeleted) {
      if (!nodeFilter(node)) {
        throw new Error(`Node with id '${nodeId}' exists but did not fulfill the filter`)
      } else {
        return node
      }
    })
    .catch((reason) => {
      // TODO: not sure this is the way, there is no Maybe/Optional in Typescript and I
      // shy away from a custom Error class for this kind of thing
      if (reason.status === 404) {
        return Promise.resolve(null)
      }
    })
  }

  loadTree(nodeId: string, nodeFilter: Predicate): Promise<LoadedTree> {
    return this.pdbLoadNode(nodeId, nodeFilter)
      .then(node => {
        return Promise.all([
          this.loadTreeNodeRecursively(node),
          this.loadParents(node, [])])
      })
      .then(results => Promise.resolve({ status: { state: State.LOADED }, tree: results[0], parents: results[1] }) )
      .catch((reason) => {
        if (reason.status === 404) {
          return Promise.resolve({ status: { state: State.NOT_FOUND } })
        } else {
          return Promise.resolve({ status: { state: State.ERROR, msg: `Error loading tree: ${reason}` } })
        }
      })
  }

  // returns a promise that recursively resolves this node and all its children
  private loadTreeNodeRecursively(node: PouchDbRepositoryNode): Promise<ResolvedRepositoryNode> {
    return this.loadChildren(node, false)
      .then(children =>
        Promise.all(children.map(child => this.loadTreeNodeRecursively(child))))
      .then(values => {
        return {
          node,
          children: values,
        }
      })
  }

  // returns a promise of an array of nodes that are NOT deleted
  private loadChildren(node: PouchDbRepositoryNode, includeDeleted: boolean): Promise<PouchDbRepositoryNode[]> {
    // console.log(`Call getChildren(${JSON.stringify(node)})`);
    return this.outlineDb.allDocs({
      include_docs: true,
      keys: node.childrefs,
    }).then(children => {
      // console.log(`= ${JSON.stringify(children)}`);
      return children.rows
        .map(child => child.doc)
        .filter(child => !(child.deleted && child.deleted === true && !includeDeleted))
    })
  }

  private loadParents(child: PouchDbRepositoryNode, parents: PouchDbRepositoryNode[]):
    Promise<PouchDbRepositoryNode[]> {
    // console.log(`loading parents for `, child, ` with parents array `, parents)
    if (child.parentref && child.parentref !== 'ROOT') {
      return this.pdbLoadNode(child.parentref, nodeIsNotDeleted)
        .then(parent => {
          parents.push(parent)
          return this.loadParents(parent, parents)
        })
        .catch(reason => Promise.resolve(parents))
    } else {
      // console.log(`no more parentref, resolving promise with parents `, parents)
      return Promise.resolve(parents)
    }
  }
}

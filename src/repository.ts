import PouchDB from 'pouchdb-browser'

export interface RepositoryNode {
  _id: string,
  _rev?: string,
  name: string,
  content: string,
  childrefs: string[],
  parentref: string,
  deleted?: boolean
}

export interface ResolvedRepositoryNode {
  node: RepositoryNode,
  children: ResolvedRepositoryNode[]
}

export enum RelativeLinearPosition {
  BEFORE,
  AFTER,
  BEGINNING,
  END,
}

export interface RelativeNodePosition {
  nodeId: string,
  beforeOrAfter: RelativeLinearPosition
}

export interface Repository {
  cdbCreateNode(id: string, name: string, content: string): Promise<RepositoryNode>
  cdbPutNode(node: RepositoryNode, retryCount?: number): Promise<void>
  cdbLoadNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode>
  cdbLoadChildren(node: RepositoryNode, includeDeleted: boolean): Promise<RepositoryNode[]>
  cdbLoadTree(node: RepositoryNode): Promise<ResolvedRepositoryNode>
}

// TODO: move this to its own file
export class PouchDbRepository implements Repository {
  private readonly outlineDb: any = new PouchDB('outlineDB')

  // TODO: consider if I really want to allow providing the ID here, this is actually only
  // ok for the root node, perhaps we need a dedicated function for that?
  cdbCreateNode(id: string, name: string, content: string): Promise<RepositoryNode> {
    const node = {
      _id: id,
      name,
      content,
      childrefs: [],
    }
    return this.outlineDb.post(node)
      .then(response => {
        // console.log(`new node created with id ${response.id} and payload '${JSON.stringify(response)}'`)
        return {
          _id: response.id,
          _rev: response.rev,
          name,
          content,
          childrefs: [],
        }
      })
  }

  cdbPutNode(node: RepositoryNode, retryCount?: number): Promise<void> {
    // console.log(`Putting node: '${JSON.stringify(node)}'`)
    return this.outlineDb.put(node)
      .catch((err) => {
        // tslint:disable-next-line:no-console
        console.log(`ERROR handler for putNode for new name "${node._id}": ${JSON.stringify(err)}`)
        // TODO we are naively just retrying when we get an update conflict, not sure this is never an infinite loop
        // TODO evaluate whether to use the upsert plugin for this? https://github.com/pouchdb/upsert
        const retries = retryCount || 0
        if (err.status === 409 && retries <= 25) {
          this.cdbPutNode(node, retries + 1)
        }
      })
  }

  // returns a promise of a node, you can determine whether to include deleted or not
  cdbLoadNode(nodeId: string, includeDeleted: boolean): Promise<RepositoryNode> {
    // console.log(`cdbLoadNode for id '${nodeId}'`)
    return this.outlineDb.get(nodeId).then(node => {
      if (node.deleted && node.deleted === true && !includeDeleted) {
        throw new Error(`Node with id '${nodeId}' was deleted`)
      } else {
        return node
      }
    })
  }

  // returns a promise of an array of nodes that are NOT deleted
  cdbLoadChildren(node: RepositoryNode, includeDeleted: boolean): Promise<RepositoryNode[]> {
    // TODO: add sanity checking that we are really passing in nodes here and not some garbage
    // TODO: at some later point make sure we can also deal with different versions of the pouchdb data
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

  // returns a promise that recursively resolves this node and all its children
  cdbLoadTree(node: RepositoryNode): Promise<ResolvedRepositoryNode> {
    return this.cdbLoadChildren(node, false)
      .then(children => Promise.all(children.map(child => this.cdbLoadTree(child))))
      .then(values => {
        return {
          node,
          children: values,
        }
      })
  }
}

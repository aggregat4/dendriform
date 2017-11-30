import PouchDB from 'pouchdb-browser'

const outlineDb : any = new PouchDB('outlineDB')

export interface RepositoryNode {
  _id: string,
  _rev: string,
  name: string,
  content: string,
  childrefs: string[],
  parentref: string,
  deleted: boolean
}

export interface ResolvedRepositoryNode {
  node: RepositoryNode,
  children: ResolvedRepositoryNode[]
}

export function loadTree (rootId: string) : Promise<ResolvedRepositoryNode> {
  return cdbLoadNode(rootId, false).then(root => cdbLoadTree(root))
}

// loads the node by id, renames it and then returns a Promise of a response when done
export function renameNode (nodeId: string, newName: string, retryCount?: number) : Promise<any> {
  return cdbLoadNode(nodeId, false)
    .then(node => {
      if (newName !== node.name) {
        cdbPutNode({
          _id: node._id,
          _rev: node._rev,
          name: newName,
          content: node.content,
          childrefs: node.childrefs,
          parentref: node.parentref,
          deleted: !!node.deleted
        })
      } else {
        console.log(`not actually renaming since "${newName}" was already set`)
      }
    })
    .catch((err) => {
      console.log(`ERROR handler for renameNode for new name "${newName}": ${JSON.stringify(err)}`)
      // TODO we are naively just retrying when we get an update conflict, not sure this is never an infinite loop
      // TODO evaluate whether to use the upsert plugin for this? https://github.com/pouchdb/upsert
      const retries = retryCount || 0
      if (err.status === 409 && retries <= 25) {
        renameNode(nodeId, newName, retries + 1)
      }
    })
}

// returns a promise of a new sibling node created before the existing node
export function createSiblingBefore (name: string, content: string, existingNodeId: string) : Promise<RepositoryNode> {
  return createSibling(name, content, existingNodeId, true)
}

function createSibling (name: string, content: string, existingNodeId: string, before: boolean) : Promise<RepositoryNode> {
  return cdbLoadNode(existingNodeId, false)
    .then(sibling => createNode(null, name, content).then(newSibling => {
        console.log(`createSibling, setting parentref for new sibling`)
        newSibling.parentref = sibling.parentref
        return cdbPutNode(newSibling)
      }))
    .then(newSibling =>
      // TODO: consider merging this logic with addChildToParent, it is a bit weird here
      // This is a bit tricky: we want to return the new sibling node, but we also have to make sure
      // it is a child of its parent. So by using Promise.all we're forcing the parenting to happen
      // and we are able to nevertheless return the new sibling node
      Promise.all([
        Promise.resolve(newSibling),
        cdbLoadNode(newSibling.parentref, false)
          .then(parent => {
            if (before) {
              parent.childrefs.splice(parent.childrefs.indexOf(existingNodeId), 0, newSibling._id)
            } else {
              parent.childrefs.splice(parent.childrefs.indexOf(existingNodeId) + 1, 0, newSibling._id)
            }
            return cdbPutNode(parent)
          })
      ])
      .then(results => Promise.resolve(results[0]))
    )
}

export function getNode (nodeId: string) : Promise<RepositoryNode> {
  return cdbLoadNode(nodeId, false)
}

export function getChildNodes (nodeId: string, includeDeleted: boolean) : Promise<RepositoryNode[]> {
  return cdbLoadNode(nodeId, includeDeleted).then(node => cdbLoadChildren(node, includeDeleted))
}

// takes an array of _actual_ nodes and a new parent id, then it reparents those nodes by:
// 1. removing them from their parent childrefs
// 2. updating their parentref to their parent's ref
// 3. adding the childs to their new parents childrefs
// If an afterNodeId is provided the nodes are inserted after that child of the new parent
export function reparentNodes (children: RepositoryNode[], newParentId: string, afterNodeId?: string) : Promise<any> {
  if (!children || children.length === 0) {
    return Promise.resolve()
  }
  const childIds = children.map(child => child._id)
  const oldParentId = children[0].parentref
  const reparentedChildren = children.map(child => {
    return {
      _id: child._id,
      _rev: child._rev,
      name: child.name,
      content: child.content,
      childrefs: child.childrefs,
      parentref: newParentId,
      deleted: !!child.deleted
    }
  })
  return cdbLoadNode(oldParentId, false)
    // 1. Remove the children to move from their parent
    .then(oldParentNode => cdbPutNode({
      _id: oldParentNode._id,
      _rev: oldParentNode._rev,
      name: oldParentNode.name,
      content: oldParentNode.content,
      parentref: oldParentNode.parentref,
      // remove all the children from their parent
      childrefs: oldParentNode.childrefs.filter((c) => childIds.indexOf(c) < 0),
      deleted: !!oldParentNode.deleted
    }))
    // 2.a. Hang the children under their new parent by updating their parent refs
    .then(oldParentUpdateResult => outlineDb.bulkDocs(reparentedChildren))
    // 2.b. and by adding them to the childrefs of the new parent
    .then(bulkUpdateChildrenResult => cdbLoadNode(newParentId, false))
    .then(newParentNode => cdbPutNode({
      _id: newParentNode._id,
      _rev: newParentNode._rev,
      name: newParentNode.name,
      content: newParentNode.content,
      parentref: newParentNode.parentref,
      // add all the new children to the new parent
      childrefs: mergeNodeIds(newParentNode.childrefs || [], childIds, afterNodeId),
      deleted: !!newParentNode.deleted
    }))
}

function mergeNodeIds (originalChildIds: string[], newChildIds: string[], afterNodeId: string) : string[] {
  if (afterNodeId) {
    const pos = originalChildIds.indexOf(afterNodeId)
    if (pos !== -1) {
      return originalChildIds.slice(0, pos + 1).concat(newChildIds, originalChildIds.slice(pos + 1))
    }
  }
  // in all other cases we just concatenate
  return originalChildIds.concat(newChildIds)
}

// deletes a node, this just sets a deleted flag to true
export function deleteNode (nodeId: string) : Promise<any> {
  return cdbLoadNode(nodeId, false)
    .then(node => {
      node.deleted = true
      return cdbPutNode(node)
    })
}

// undeletes a node, just removing its deleted flag
export function undeleteNode (nodeId: string) : Promise<any> {
  return cdbLoadNode(nodeId, true)
    .then(node => {
      delete node.deleted // removing this flag from the object since it is not required anymore
      return cdbPutNode(node)
    })
}

export function createNode (id: string, name: string, content: string) : Promise<RepositoryNode> {
  console.log(`cdbCreateNode id:${id} - name:${name}`)
  const node = {
    _id: id,
    name,
    content,
    childrefs: [],
  }
  return outlineDb.post(node)
    .then(response => {
      console.log(`new node created with id ${response.id}`)
      return {
        _id: response.id,
        _rev: response.rev,
        name,
        content,
        childrefs: [],
      }
    })
}

// Returns a promise of the parent node
export function addChildToParent (childId: string, parentId: string) : Promise<RepositoryNode> {
  console.log(`addChildToParent ${childId} -> ${parentId}`)
  return cdbLoadNode(childId, false)
    .then(child => {
      child.parentref = parentId
      return cdbPutNode(child)
    })
    .then(child => cdbLoadNode(parentId, false)
      .then(parent => {
        parent.childrefs.push(childId)
        return cdbPutNode(parent)
      })
      .then(result => result)
    )
}

function cdbPutNode (node: RepositoryNode) : Promise<RepositoryNode> {
  return outlineDb.put(node)
}

// returns a promise of a node, you can determine whether to include deleted or not
function cdbLoadNode (nodeId: string, includeDeleted: boolean) : Promise<RepositoryNode> {
  return outlineDb.get(nodeId).then(node => {
    if (node.deleted && node.deleted === true && !includeDeleted) {
      throw new Error(`Node with id '${nodeId}' was deleted`)
    } else {
      return node
    }
  })
}

// returns a promise of an array of nodes that are NOT deleted
function cdbLoadChildren (node: RepositoryNode, includeDeleted: boolean) : Promise<RepositoryNode[]> {
  // TODO: add sanity checking that we are really passing in nodes here and not some garbage
  // TODO: at some later point make sure we can also deal with different versions of the pouchdb data
  // console.log(`Call getChildren(${JSON.stringify(node)})`);
  return outlineDb.allDocs({
    include_docs: true,
    keys: node.childrefs
  }).then(children => {
    // console.log(`= ${JSON.stringify(children)}`);
    return children.rows
      .map(child => child.doc)
      .filter(child => !(child.deleted && child.deleted === true && !includeDeleted))
  })
}

// returns a promise that recursively resolves this node and all its children
function cdbLoadTree (node: RepositoryNode) : Promise<ResolvedRepositoryNode> {
  return cdbLoadChildren(node, false)
    .then(children => Promise.all(children.map(child => cdbLoadTree(child))))
    .then(values => {
      return {
        node: node,
        children: values
      }
    })
}

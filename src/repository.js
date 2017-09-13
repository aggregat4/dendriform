import PouchDB from 'pouchdb-browser'

const outlineDb = new PouchDB('outlineDB')
outlineDb.put({
  _id: 'ROOT',
  name: 'ROOT node name',
  content: 'ROOT node content',
  childrefs: ['foo', 'bar'],
  parentref: null
})
outlineDb.put({
  _id: 'foo',
  name: 'foo node',
  childrefs: ['foofoo'],
  parentref: 'ROOT'
})
outlineDb.put({
  _id: 'foofoo',
  name: 'foo foo node',
  childrefs: [],
  parentref: 'foo'
})
outlineDb.put({
  _id: 'bar',
  name: 'bar node',
  childrefs: [],
  parentref: 'ROOT'
})

// returns a Promise of a loaded tree
export function loadTree (rootId) {
  return cdbLoadNode(rootId).then(root => cdbLoadTree(root))
}

// loads the node by id, renames it and then returns a Promise of a response when done
export function renameNode (nodeId, newName) {
  return cdbLoadNode(nodeId)
    .then(node => cdbPutNode({
      _id: node._id,
      _rev: node._rev,
      name: newName,
      content: node.content,
      childrefs: node.childrefs,
      parentref: node.parentref
    }))
}

// returns a promise of a new sibling node
export function createSibling (name, content, existingNodeId) {
  return cdbLoadNode(existingNodeId)
    .then(sibling => {
      console.log(`cdbcreateNode '${name}' '${content}' '${sibling.parentref}'`)
      return cdbCreateNode(name, content, sibling.parentref)
    })
    .then(newSibling =>
      // This is a bit tricky: we want to return the new sibling node, but we also have to make sure
      // it is a child of its parent. So by using Promise.all we're forcing the parenting to happen
      // and we are able to nevertheless return the new sibling node
      Promise.all([
        Promise.resolve(newSibling),
        cdbLoadNode(newSibling.parentref).then(parent => {
          parent.childrefs.splice(parent.childrefs.indexOf(existingNodeId) + 1, 0, newSibling._id)
          return cdbPutNode(parent)
        })
      ]).then(results => Promise.resolve(results[0]))
    )
}

export function getChildNodes (nodeId) {
  return cdbLoadNode(nodeId).then(node => cdbLoadChildren(node))
}

// takes an array of _actual_ nodes and a new parent id, and sets the parentref to that id
export function reparentNodes (children, newParentId) {
  const reparentedChildren = children.map(child => {
    return {
      _id: child._id,
      _rev: child._rev,
      name: child.name,
      content: child.content,
      childrefs: child.childrefs,
      parentref: newParentId
    }
  })
  return outlineDb.bulkDocs(reparentedChildren)
}

// deletes a node, this includes removing it as a reference from its parent's childrefs
export function deleteNode (nodeId) {
  return cdbLoadNode(nodeId)
    .then(node => Promise.all([
      cdbLoadNode(node.parentref)
        .then(parent => {
          const childIndex = parent.childrefs.indexOf(nodeId)
          if (childIndex > -1) {
            parent.childrefs.splice(childIndex, 1)
          } else {
            console.log(`WARN Deleting a node, but can not find its ID in its parent's childrefs`)
          }
          return parent
        })
        .then(parent => cdbPutNode(parent)),
      outlineDb.remove(node)
    ])
  )
}

function cdbCreateNode (name, content, parentref) {
  return outlineDb.post({
    name,
    content,
    childrefs: [],
    parentref
  }).then(response => {
    return {
      _id: response.id,
      _rev: response.rev,
      name,
      content,
      childrefs: [],
      parentref
    }
  })
}

function cdbPutNode (node) {
  return outlineDb.put(node)
}

// returns a promise of a node
function cdbLoadNode (nodeId) {
  return outlineDb.get(nodeId)
}

// returns a promise of an array of nodes
function cdbLoadChildren (node) {
  // TODO: add sanity checking that we are really passing in nodes here and not some garbage
  // TODO: at some later point make sure we can also deal with different versions of the pouchdb data
  // console.log(`Call getChildren(${JSON.stringify(node)})`);
  return outlineDb.allDocs({
    include_docs: true,
    keys: node.childrefs
  }).then(children => {
    // console.log(`= ${JSON.stringify(children)}`);
    return children.rows.map(child => child.doc)
  })
}

// returns a promise that recursively resolves this node and all its children
function cdbLoadTree (node) {
  return cdbLoadChildren(node)
    .then(children => Promise.all(children.map(child => cdbLoadTree(child))))
    .then(values => {
      node.children = values
      return node
    })
}

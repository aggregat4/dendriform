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

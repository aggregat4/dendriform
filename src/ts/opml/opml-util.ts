import { ResolvedRepositoryNode } from '../domain/domain'

/**
 * Parses a DOM tree representing an OPML file into RepositoryNodes. We assume a workflowy
 * or dynalist like document. Currently only supports the node name and the note.
 *
 * In dynalist it is possible to have multiple root nodes (you can select a bunch of nodes
 * and export them) and this is also supported.
 */
export function opmlDocumentToRepositoryNodes(doc: Document): ResolvedRepositoryNode[] {
  const opmlRootNode = doc.getRootNode().firstChild
  if (!opmlRootNode || opmlRootNode.nodeName.toUpperCase() !== 'OPML') {
    throw new Error(`Document is not OPML, root element is called ${opmlRootNode.nodeName}`)
  }
  const bodyEl: Element = doc.querySelector('body')
  const rootOutlines = this.childElementsByName(bodyEl, 'outline')
  if (!rootOutlines || rootOutlines.length === 0) {
    throw new Error('OPML document is empty')
  }
  const repositoryNodes = []
  for (const rootOutline of rootOutlines) {
    const potentialRepositoryNode = this.opmlOutlineNodeToRepositoryNode(rootOutline)
    if (potentialRepositoryNode) {
      repositoryNodes.push(potentialRepositoryNode)
    }
  }
  return repositoryNodes
}

export function repositoryNodeToOpmlDocument(node: ResolvedRepositoryNode): Document {
  const xmlDoc = document.implementation.createDocument(null, 'opml', null)
  xmlDoc.documentElement.setAttribute('version', '2.0') // just copied from workflowy, need to check the spec
  const headEl = xmlDoc.createElementNS('', 'head')
  const bodyEl = xmlDoc.createElementNS('', 'body')
  bodyEl.appendChild(createOpmlNode(node))
  return xmlDoc
}

function createOpmlNode(node: ResolvedRepositoryNode): Element {
  
}

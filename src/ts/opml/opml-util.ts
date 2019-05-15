import { ResolvedRepositoryNode, createNewResolvedRepositoryNodeWithContent, DeferredRepositoryNode } from '../domain/domain'
import { generateUUID } from '../util';

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
  const rootOutlines = childElementsByName(bodyEl, 'outline')
  if (!rootOutlines || rootOutlines.length === 0) {
    throw new Error('OPML document is empty')
  }
  const repositoryNodes = []
  for (const rootOutline of rootOutlines) {
    const potentialRepositoryNode = opmlOutlineNodeToRepositoryNode(rootOutline)
    if (potentialRepositoryNode) {
      repositoryNodes.push(potentialRepositoryNode)
    }
  }
  return repositoryNodes
}

function childElementsByName(el: Element, name: string): Element[] {
  return Array.from(el.children).filter(c => c.nodeName.toUpperCase() === name.toUpperCase())
}

function opmlOutlineNodeToRepositoryNode(outlineEl: Element): ResolvedRepositoryNode {
  if (outlineEl.tagName.toUpperCase() !== 'OUTLINE') {
    return null
  }
  const repoNode = createNewResolvedRepositoryNodeWithContent(
    generateUUID(),
    outlineEl.getAttribute('text'),
    outlineEl.getAttribute('_note'))
  const children = childElementsByName(outlineEl, 'outline')
  for (const child of children) {
    repoNode.children.push(opmlOutlineNodeToRepositoryNode(child))
  }
  return repoNode
}

export async function repositoryNodeToOpmlDocument(node: DeferredRepositoryNode): Promise<Document> {
  const xmlDoc = document.implementation.createDocument(null, 'opml', null)
  xmlDoc.documentElement.setAttribute('version', '2.0') // just copied from workflowy, need to check the spec
  const headEl = xmlDoc.createElementNS('', 'head')
  const bodyEl = xmlDoc.createElementNS('', 'body')
  // TODO: make the choice to export deleted elements optional?
  if (!node.node.deleted) {
    const childEl = await createOpmlNode(xmlDoc, node)
    bodyEl.appendChild(childEl)
  }
  xmlDoc.documentElement.appendChild(headEl)
  xmlDoc.documentElement.appendChild(bodyEl)
  return xmlDoc
}

async function createOpmlNode(xmlDoc: Document, node: DeferredRepositoryNode): Promise<Element> {
  const el = xmlDoc.createElementNS('', 'outline')
  el.setAttribute('text', node.node.name || '') // exporting "empty" nodes as well, seems sensible?
  if (node.node.content) {
    el.setAttribute('_note', node.node.content)
  }
  const children = await node.children
  for (const child of children) {
    if (!child.node.deleted) {
      el.appendChild(await createOpmlNode(xmlDoc, child))
    }
  }
  return el
}

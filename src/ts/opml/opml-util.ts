import {
  ResolvedRepositoryNode,
  createNewResolvedRepositoryNodeWithContent,
} from '../domain/domain'
import { generateUUID } from '../utils/util'

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
  const repositoryNodes: ResolvedRepositoryNode[] = []
  for (const rootOutline of rootOutlines) {
    const potentialRepositoryNode = opmlOutlineNodeToRepositoryNode(rootOutline)
    if (potentialRepositoryNode) {
      repositoryNodes.push(potentialRepositoryNode)
    }
  }
  return repositoryNodes
}

function childElementsByName(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.nodeName.toUpperCase() === name.toUpperCase())
}

function opmlOutlineNodeToRepositoryNode(outlineEl: Element): ResolvedRepositoryNode {
  if (outlineEl.tagName.toUpperCase() !== 'OUTLINE') {
    return null
  }
  const repoNode = createNewResolvedRepositoryNodeWithContent(
    generateUUID(),
    outlineEl.getAttribute('text'),
    outlineEl.getAttribute('_note')
  )
  const children = childElementsByName(outlineEl, 'outline')
  for (const child of children) {
    repoNode.children.elements.push(opmlOutlineNodeToRepositoryNode(child))
  }
  return repoNode
}

export function repositoryNodeToOpmlDocument(node: ResolvedRepositoryNode): Document {
  const xmlDoc = document.implementation.createDocument(null, 'opml', null)
  xmlDoc.documentElement.setAttribute('version', '2.0') // just copied from workflowy, need to check the spec
  const headEl = xmlDoc.createElementNS('', 'head')
  const bodyEl = xmlDoc.createElementNS('', 'body')
  if (!node.node.deleted) {
    const childEl = createOpmlNode(xmlDoc, node)
    bodyEl.appendChild(childEl)
  }
  xmlDoc.documentElement.appendChild(headEl)
  xmlDoc.documentElement.appendChild(bodyEl)
  return xmlDoc
}

function createOpmlNode(xmlDoc: Document, node: ResolvedRepositoryNode): Element {
  const el = xmlDoc.createElementNS('', 'outline')
  el.setAttribute('text', node.node.name || '') // exporting "empty" nodes as well, seems sensible?
  if (node.node.note) {
    el.setAttribute('_note', node.node.note)
  }
  const children = node.children.elements
  for (const child of children) {
    if (!child.node.deleted) {
      el.appendChild(createOpmlNode(xmlDoc, child))
    }
  }
  return el
}

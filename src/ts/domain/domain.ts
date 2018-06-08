export interface RepositoryNode {
  _id: string,
  _rev?: string,
  name: string,
  content: string,
  childrefs: string[],
  parentref: string,
  deleted?: boolean,
  collapsed?: boolean,
}

export function createNewRepositoryNode(id: string, name: string, parentref?: string): RepositoryNode {
  return {
    _id: id,
    name,
    content: null,
    childrefs: [],
    parentref,
  }
}

export function createNewResolvedRepositoryNode(id: string, name: string, parentref?: string): ResolvedRepositoryNode {
  return {
    node: createNewRepositoryNode(id, name, parentref),
    children: [],
  }
}

// TODO: consider refactoring this to just extend the RepositoryNode interface
export interface ResolvedRepositoryNode {
  node: RepositoryNode,
  children: ResolvedRepositoryNode[],
}

export interface Filter {
  query: string
}

export interface Highlight {
  pos: number,
  length: number
}

export class FilteredRepositoryNode {
  // TODO: future extension: allow descriptions to be searched
  constructor(
    readonly node: RepositoryNode,
    readonly children: FilteredRepositoryNode[],
    readonly filterApplied: boolean,
    readonly nameHits: Highlight[]) {}

  isIncluded(): boolean {
    return !this.filterApplied || this.nameHits.length > 0
  }
}

function findHits(corpus: string, filter: Filter): Highlight[] {
  const highlights = []
  let pos = 0 - filter.query.length
  const lowerCaseName = corpus.toLowerCase()
  while ((pos = lowerCaseName.indexOf(this.filter.query, pos + this.filter.query.length)) > -1) {
    highlights.push({pos, length: this.filter.query.length})
  }
  return highlights
}

export function filterNode(node: ResolvedRepositoryNode, filter?: Filter): FilteredRepositoryNode {
  return new FilteredRepositoryNode(
    node.node,
    node.children.map(c => filterNode(c, filter)),
    !!filter,
    filter ? findHits(node.node.name, filter) : [])
}

export enum State {
  LOADING,
  LOADED,
  ERROR,
  NOT_FOUND,
}

export interface Status {
  state: State
  msg?: string
}

export interface LoadedTree {
  status: Status
  tree?: ResolvedRepositoryNode
  parents?: RepositoryNode[]
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

export enum MergeNameOrder {
  SOURCE_TARGET,
  TARGET_SOURCE,
}

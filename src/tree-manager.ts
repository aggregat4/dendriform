import {Command, CommandBuilder, TreeService} from './tree-api'
import {RepositoryTreeService} from './tree-service-repository'
import {InMemoryRepository} from './repository-inmemory'
import {PouchDbRepository} from './repository-pouchdb'
import {State, ResolvedRepositoryNode, LoadedTree} from './repository'
import {RepositoryService} from './repository-service'

export class UndoableTreeService implements TreeService {
  readonly undoBuffer: Array<Promise<Command>> = []
  readonly redoBuffer: Array<Promise<Command>> = []

  readonly cachingTreeService = new RepositoryTreeService(new RepositoryService(new InMemoryRepository()))
  readonly pouchDbTreeService = new RepositoryTreeService(new RepositoryService(new PouchDbRepository()))

  private currentRootNode: string = null

  popUndoCommand(): Promise<Command> {
    return this.undoBuffer.pop()
  }

  loadTree(nodeId: string): Promise<LoadedTree> {
    // this is our implicit caching here: when the node was already loaded, just return it
    if (this.currentRootNode && this.currentRootNode === nodeId) {
      return this.cachingTreeService.loadTree(nodeId)
    } else {
      return this.pouchDbTreeService.loadTree(nodeId)
        .then((tree) => {
          if (tree.status.state === State.LOADED) {
            this.cachingTreeService.initTree(tree.tree)
          }
          this.currentRootNode = nodeId
          // TODO: this may be slightly wrong, we are initialising the in memory tree
          // only if we could successfully load the actual tree, in the other cases
          // it has an undefined state, should probably clear it then...
          return tree
        })
    }
  }

  initTree(node: ResolvedRepositoryNode): void {
    throw new Error('Method not implemented.')
  }

  // Store actual Promises of commands in the UNDO and REDO buffers.
  //    This allows us to immediately return and to have consistently ordered
  //    UNDO and REDO buffers AND it allows us to nevertheless do things
  //    asynchronously (like if pouchdb takes a long time to complete, we will
  //    then defer waiting for that to the undo command handling)
  exec(command: Command): Promise<any> {
    // console.log(`executing command: ${JSON.stringify(command)}`)
    const undoCommandPromise = this.cachingTreeService.exec(command)
      .then(() => this.pouchDbTreeService.exec(command))
      .then(() => {
        if (command.undoable) {
          const undoCommand = new CommandBuilder(command.payload.inverse()).requiresRender().build()
          if (command.beforeFocusNodeId) {
            undoCommand.afterFocusNodeId = command.beforeFocusNodeId
            undoCommand.afterFocusPos = command.beforeFocusPos
          }
          return undoCommand
        }
      })
    if (command.undoable) {
      this.undoBuffer.push(undoCommandPromise)
      this.redoBuffer.push(undoCommandPromise.then(() => Promise.resolve(command)))
    }
    return undoCommandPromise
  }
}

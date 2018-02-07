import {Command, CommandBuilder, TreeService, LoadedTree} from './tree-api'
import {CachingTreeService} from './tree-service-local'
import {PouchDbTreeService} from './tree-service-pouchdb'

export class UndoableTreeService implements TreeService {
  readonly undoBuffer: Array<Promise<Command>> = []
  readonly redoBuffer: Array<Promise<Command>> = []

  readonly wrappedTreeService = new CachingTreeService(new PouchDbTreeService())

  popUndoCommand(): Promise<Command> {
    return this.undoBuffer.pop()
  }

  getCachedTree(): LoadedTree {
    return this.wrappedTreeService.getCachedTree()
  }

  loadTree(nodeId: string): Promise<LoadedTree> {
    return this.wrappedTreeService.loadTree(nodeId)
  }

  // Store actual Promises of commands in the UNDO and REDO buffers.
  //    This allows us to immediately return and to have consistently ordered
  //    UNDO and REDO buffers AND it allows us to nevertheless do things
  //    asynchronously (like if pouchdb takes a long time to complete, we will
  //    then defer waiting for that to the undo command handling)
  exec(command: Command): Promise<any> {
    // console.log(`executing command: ${JSON.stringify(command)}`)
    const undoCommandPromise = this.wrappedTreeService.exec(command)
      .then(() => {
        if (command.undoable) {
          const undoCommand = new CommandBuilder(command.payload).requiresRender().build()
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

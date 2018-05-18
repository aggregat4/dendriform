import {
  Command,
  CommandBuilder,
  TreeService,
} from './service'
import {
  State,
  ResolvedRepositoryNode,
  LoadedTree,
} from '../domain/domain'

export class UndoableTreeService implements TreeService {
  readonly undoBuffer: Array<Promise<Command>> = []
  readonly redoBuffer: Array<Promise<Command>> = []

  constructor(readonly treeService: TreeService) {}

  popUndoCommand(): Promise<Command> {
    return this.undoBuffer.pop()
  }

  loadTree(nodeId: string): Promise<LoadedTree> {
    return this.treeService.loadTree(nodeId)
  }

  // Store actual Promises of commands in the UNDO and REDO buffers.
  //    This allows us to immediately return and to have consistently ordered
  //    UNDO and REDO buffers AND it allows us to nevertheless do things
  //    asynchronously (like if pouchdb takes a long time to complete, we will
  //    then defer waiting for that to the undo command handling)
  exec(command: Command): Promise<any> {
    // console.log(`executing command: ${JSON.stringify(command)}`)
    const undoCommandPromise = this.treeService.exec(command)
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

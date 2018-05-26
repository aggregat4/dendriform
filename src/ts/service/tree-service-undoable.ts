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
  readonly undoBuffer: Command[] = []
  // readonly redoBuffer: Array<Promise<Command>> = []
  private undoCommandPointer: number = -1

  constructor(readonly treeService: TreeService) {}

  popUndoCommand(): Command {
    if (this.undoCommandPointer >= 0 && this.undoBuffer.length > 0) {
      this.undoCommandPointer--
      return this.undoBuffer[this.undoCommandPointer + 1]
    }
  }

  popRedoCommand(): Command {
    if (this.undoCommandPointer < this.undoBuffer.length - 1 && this.undoBuffer.length > 0) {
      this.undoCommandPointer++
      // A redo command is an inverted undo command
      return new CommandBuilder(this.undoBuffer[this.undoCommandPointer].payload.inverse())
        .requiresRender()
        .build()
    }
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
    const commandPromise = this.treeService.exec(command)
    if (command.undoable) {
      const undoCommand = new CommandBuilder(command.payload.inverse()).requiresRender().build()
      if (command.beforeFocusNodeId) {
        undoCommand.afterFocusNodeId = command.beforeFocusNodeId
        undoCommand.afterFocusPos = command.beforeFocusPos
      }
      this.addUndoCommandPromise(undoCommand)
    }
    return commandPromise
  }

  // TODO: unclear if this system is cool, we are always growing the buffer and
  // never resetting the undo stack, maybe this gets unintuitive sometimes?
  private addUndoCommandPromise(undoCommand: Command): void {
    if (this.undoBuffer.length === 0) {
      this.undoBuffer.push(undoCommand)
      this.undoCommandPointer = 0
    } else {
      // splice the undocommandpromise into the undobuffer
      this.undoBuffer.splice(this.undoCommandPointer + 1, 0, undoCommand)
      this.undoCommandPointer++
    }
  }
}

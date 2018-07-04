import {
  Command,
  CommandBuilder,
  CommandHandler,
} from './commands'

export class UndoableCommandHandler implements CommandHandler {
  readonly undoBuffer: Command[] = []
  // readonly redoBuffer: Array<Promise<Command>> = []
  private undoCommandPointer: number = -1

  constructor(readonly commandHandler: CommandHandler) {}

  popUndoCommand(): Command {
    // console.log(`about to pop undo command with pointer `, this.undoCommandPointer, ` in buffer `, this.undoBuffer)
    if (this.undoCommandPointer >= 0 && this.undoBuffer.length > 0) {
      const undoCommand = this.undoBuffer[this.undoCommandPointer]
      this.undoCommandPointer--
      return undoCommand
    }
  }

  popRedoCommand(): Command {
    // console.log(`about to pop redo command with pointer `, this.undoCommandPointer, ` in buffer `, this.undoBuffer)
    if (this.undoCommandPointer < this.undoBuffer.length - 1 &&
        this.undoCommandPointer >= -1 &&
        this.undoBuffer.length > 0) {
      // A redo command is an inverted undo command
      this.undoCommandPointer++
      const nextUndoCommand = this.undoBuffer[this.undoCommandPointer]
      return this.invert(nextUndoCommand)
    }
  }

  exec(command: Command): Promise<any> {
    const commandPromise = this.commandHandler.exec(command)
    if (command.undoable) {
      const undoCommand = this.invert(command)
      this.addUndoCommand(undoCommand)
    }
    return commandPromise
  }

  private invert(command: Command): Command {
    const inverted = new CommandBuilder(command.payload.inverse()).build()
    if (command.beforeFocusNodeId) {
      inverted.afterFocusNodeId = command.beforeFocusNodeId
      inverted.afterFocusPos = command.beforeFocusPos
    }
    if (command.afterFocusNodeId) {
      inverted.beforeFocusNodeId = command.afterFocusNodeId
      inverted.beforeFocusPos = command.afterFocusPos
    }
    return inverted
  }

  private addUndoCommand(undoCommand: Command): void {
    if (this.undoBuffer.length === 0) {
      this.undoBuffer.push(undoCommand)
      this.undoCommandPointer = 0
    } else {
      // we add the command at the current location in the buffer
      this.undoBuffer.splice(this.undoCommandPointer + 1, 0, undoCommand)
      this.undoCommandPointer++
      // if we add a command in the middle somewhere (and not at the end),
      // remove all remaining commands, otherwise behaviour is weird for the user
      if (this.undoCommandPointer < this.undoBuffer.length - 1) {
        this.undoBuffer.splice(this.undoCommandPointer + 1)
      }
    }
  }
}

import {Command} from './tree-api'

const UNDO_BUFFER: Array<Promise<Command>> = []
const REDO_BUFFER: Array<Promise<Command>> = []

export function popLastUndoCommand(): Promise<Command> {
  return UNDO_BUFFER.pop()
}

// Current plan:
//  - have 2 executors: one for local repo, and one for pouchdb repo
//  - gather their results (basically Promises of UndoCommands) and combine them (we need to undo in both places)
//  - compose the undocommand promises with our focus handling
//  - store actual Promises of commands in the UNDO and REDO buffers.
//    This allos us to immediately return and to have consistently ordered
//    UNDO and REDO buffers AND it allows us to nevertheless do things
//    asynchronously (like if pouchdb takes a long time to complete, we will
//    then defer waiting for that to the undo command handling)
export function executeCommand(command: Command): void {
  // console.log(`executing command: ${JSON.stringify(command)}`)
  const undoCommandPromises: Array<Promise<Command>> =
    [STORE_EXECUTOR.exec(command), POUCHDB_EXECUTOR.exec(command)]
    .map(undoCommandPromise => undoCommandPromise.then((undoCommand) => {
      if (command.undoable) {
        if (command.beforeFocusNodeId) {
          undoCommand.afterFocusNodeId = command.beforeFocusNodeId
          undoCommand.afterFocusPos = command.beforeFocusPos
        }
      }
      return undoCommand
    }))
  if (command.undoable) {
    UNDO_BUFFER.push(...undoCommandPromises)
    REDO_BUFFER.push(Promise.all(undoCommandPromises).then(() => Promise.resolve(command)))
  }
}

import { CommandExecutor, TransientState } from './tree-helpers'
import { UndoableCommandHandler } from '../commands/command-handler-undoable'
import { KeyboardEventTrigger } from './keyboardshortcut'
import { Dialogs } from './dialogs'

export class TreeAction {
  constructor(
    readonly trigger: KeyboardEventTrigger,
    readonly handler: (event: Event, treeActionContext: TreeActionContext) => void,
    // TODO: i18n
    readonly name: string) {}
}

export class TreeActionContext {
  constructor(
    readonly commandExecutor: CommandExecutor,
    readonly transientStateManager: TransientState,
    readonly undoCommandHandler: UndoableCommandHandler,
    readonly dialogs: Dialogs,
  ) {}
}

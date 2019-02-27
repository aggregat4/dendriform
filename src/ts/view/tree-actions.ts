import { CommandExecutor, TransientStateManager } from './tree-helpers'
import { UndoableCommandHandler } from '../commands/command-handler-undoable'
import { KeyboardEventTrigger } from './keyboardshortcut'

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
    readonly transientStateManager: TransientStateManager,
    readonly undoCommandHandler: UndoableCommandHandler,
  ) {}
}

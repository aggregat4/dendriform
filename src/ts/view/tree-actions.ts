import { Command } from '../commands/commands'
import { TreeService } from '../service/tree-service'
import { Dialogs } from './dialogs'
import { KeyboardEventTrigger } from './keyboardshortcut'
import { CommandExecutor, TransientState } from './tree-helpers'

export abstract class TreeAction {
  constructor(
    readonly trigger: KeyboardEventTrigger,
    readonly name: string // TODO: i18n
  ) {}
}

export abstract class CommandCreationAction extends TreeAction {
  abstract createCommand(event: Event, treeActionContext: TreeActionContext): Command
}

export abstract class ExecutableAction extends TreeAction {
  abstract exec(event: Event, treeActionContext: TreeActionContext): Promise<void>
}

export class TreeActionContext {
  constructor(
    readonly commandExecutor: CommandExecutor,
    readonly transientStateManager: TransientState,
    readonly dialogs: Dialogs,
    readonly treeService: TreeService
  ) {}
}

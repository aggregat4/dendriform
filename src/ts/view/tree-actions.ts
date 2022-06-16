import { TreeService } from '../service/tree-service'
import { Dialogs } from './dialogs'
import { KeyboardEventTrigger } from './keyboardshortcut'
import { CommandExecutor, TransientState } from './tree-helpers'

export abstract class TreeAction {
  constructor(
    readonly trigger: KeyboardEventTrigger,
    readonly name: string // TODO: i18n
  ) {}

  abstract handle(event: Event, treeActionContext: TreeActionContext): void
}

export class TreeActionContext {
  constructor(
    readonly commandExecutor: CommandExecutor,
    readonly transientStateManager: TransientState,
    readonly dialogs: Dialogs,
    readonly treeService: TreeService
  ) {}
}

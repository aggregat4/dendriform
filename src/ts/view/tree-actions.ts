import { CommandExecutor, TransientState } from './tree-helpers'
import { KeyboardEventTrigger } from './keyboardshortcut'
import { Dialogs } from './dialogs'
import { TreeService } from '../service/tree-service'

export abstract class TreeAction {
  constructor(
    readonly trigger: KeyboardEventTrigger,
    readonly name: string) // TODO: i18n
  {}

  abstract handle(event: Event, treeActionContext: TreeActionContext): void
}

export class TreeActionContext {
  constructor(
    readonly commandExecutor: CommandExecutor,
    readonly transientStateManager: TransientState,
    readonly dialogs: Dialogs,
    readonly treeService: TreeService,
  ) {}
}

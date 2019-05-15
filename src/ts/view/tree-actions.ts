import { CommandExecutor, TransientState } from './tree-helpers'
import { KeyboardEventTrigger } from './keyboardshortcut'
import { Dialogs } from './dialogs'
import { TreeService } from '../service/tree-service'

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
    readonly dialogs: Dialogs,
    readonly treeService: TreeService,
  ) {}
}

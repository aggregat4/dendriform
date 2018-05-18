import {CommandHandler} from './command-handler'
import {
  Command,
  TreeService,
} from '../service/service'
import { getNameElement } from './tree-dom-util'
import { setCursorPos } from '../util'

export class ServiceCommandHandler implements CommandHandler {

  constructor(
    readonly treeService: TreeService,
  ) {}

  exec(command: Command) {
    this.treeService.exec(command)
      .then(() => {
        if (command.afterFocusNodeId) {
          this.focus(command.afterFocusNodeId, command.afterFocusPos)
        }
      })
  }

  private focus(nodeId: string, charPos: number) {
    const element = document.getElementById(nodeId)
    // tslint:disable-next-line:no-console
    // console.log(`focusing on node ${nodeId} at ${charPos}, exists?`, element)
    if (element) {
      const nameElement: HTMLElement = getNameElement(element) as HTMLElement
      nameElement.focus()
      if (charPos > -1) {
        setCursorPos(nameElement, charPos)
      }
    }
  }

}

import {CommandHandler} from './command-handler'
import {Command, TreeService} from '../service/service'

export class ServiceCommandHandler implements CommandHandler {

  constructor(readonly treeService: TreeService) {}

  exec(command: Command) {
    this.treeService.exec(command)
  }

}

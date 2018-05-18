import {Command} from '../service/service'

export interface CommandHandler {
  exec(command: Command): void
}

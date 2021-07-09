import { Reporter } from './tizzy'
import rgb from 'barecolor'

export class TerminalReporter implements Reporter {
  start(headline: string): void {
    rgb.cyan(headline + ' ')
  }

  end(noftests: number): void {
    rgb.greenln(`✓ ${noftests}`)
    console.info('\n')
  }

  success(testname: string) {
    rgb.gray('• ')
  }

  failure(testname: string, error: Error) {
    rgb.red(`\n\n! ${testname} \n\n`)
    prettyError(error)
  }
}

function prettyError(e: Error): void {
  const msg = e.stack
  if (!msg) {
    return rgb.yellow(e)
  }
  const i = msg.indexOf('\n')
  rgb.yellowln(msg.slice(0, i))
  rgb.gray(msg.slice(i))
}

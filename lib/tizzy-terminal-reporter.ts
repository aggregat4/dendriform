import rgb from 'barecolor'
import { Reporter } from './tizzy'

export class TerminalReporter implements Reporter {
  start(headline: string): void {
    rgb.cyan(headline + ' ')
  }

  end(noftests: number): void {
    rgb.greenln(`✓ ${noftests}`)
    console.info('\n')
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  success(testname: string) {
    rgb.gray('• ')
  }

  failure(testname: string, error: string | Error) {
    rgb.red(`\n\n! ${testname} \n\n`)
    prettyError(error)
  }
}

function prettyError(e: string | Error): void {
  if (typeof e === 'string') {
    rgb.yellow(e)
  } else {
    if (e.message) {
      rgb.yellow(`error message: ${e.message}`)
    }
    const msg = e.stack
    if (msg) {
      const i = msg.indexOf('\n')
      rgb.yellowln(msg.slice(0, i))
      rgb.gray(msg.slice(i))
    }
  }
}

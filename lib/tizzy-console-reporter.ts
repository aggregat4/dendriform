import { Reporter } from './tizzy'

export class ConsoleReporter implements Reporter {
  start(headline: string): void {
    console.log()
    console.log(`Starting tests '${headline}'`)
  }
  end(noftests: number): void {
    console.log(`Finished`, noftests, `tests.`)
    console.log()
  }
  success(testname: string) {
    console.log(`Test success:`, testname)
    console.log()
  }
  failure(testname: string, error: Error) {
    console.warn(`Test failure in`, testname, `, cause:`, error.stack)
  }
}

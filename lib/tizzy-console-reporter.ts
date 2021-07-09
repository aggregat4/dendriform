import { Reporter } from './tizzy'

export class ConsoleReporter implements Reporter {
  start(headline: string): void {
    console.log(`Starting tests`, headline)
  }
  end(noftests: number): void {
    console.log(`Finished`, noftests, `tests.`)
  }
  success(testname: string) {
    console.log(`Test success:`, testname)
  }
  failure(testname: string, error: Error) {
    console.warn(`Test failure in`, testname, `, cause:`, error.stack)
  }
}

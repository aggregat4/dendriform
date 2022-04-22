import { Reporter } from './tizzy'

export class BrowserReporter implements Reporter {
  start(headline: string): void {
    window.dispatchEvent(new CustomEvent('tizzyStart', { detail: { headline } }))
  }
  end(noftests: number): void {
    window.dispatchEvent(new CustomEvent('tizzyEnd', { detail: { noftests } }))
  }
  success(testname: string) {
    window.dispatchEvent(new CustomEvent('tizzySuccess', { detail: { testname } }))
  }
  failure(testname: string, error: Error) {
    window.dispatchEvent(new CustomEvent('tizzyFailure', { detail: { testname, error } }))
  }
}

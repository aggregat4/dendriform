import { Page } from 'puppeteer'
import { TerminalReporter } from './tizzy-terminal-reporter'

export async function installTizzyPuppeteerBridge(page: Page) {
  // Expose a handler to the page
  const terminalReporter = new TerminalReporter()
  await page.exposeFunction('onTizzyEvent', ({ type, detail }) => {
    switch (type) {
      case 'tizzyStart':
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        terminalReporter.start((detail as any).headline)
        break
      case 'tizzyEnd':
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        terminalReporter.end((detail as any).noftests)
        break
      case 'tizzySuccess':
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        terminalReporter.success((detail as any).testname)
        break
      case 'tizzyFailure':
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        terminalReporter.failure((detail as any).testname, (detail as any).error)
        break
    }
  })
  await page.evaluateOnNewDocument(() => {
    const listener = ({ type, detail }) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.onTizzyEvent({ type, detail })
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.addEventListener('tizzyStart', listener)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.addEventListener('tizzyEnd', listener)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.addEventListener('tizzySuccess', listener)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.addEventListener('tizzyFailure', listener)
  })
}

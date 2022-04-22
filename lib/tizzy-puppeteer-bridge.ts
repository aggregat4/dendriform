import { Page } from 'puppeteer'
import { TerminalReporter } from './tizzy-terminal-reporter'

export async function installTizzyPuppeteerBridge(page: Page) {
  // Expose a handler to the page
  const terminalReporter = new TerminalReporter()
  await page.exposeFunction('onTizzyEvent', ({ type, detail }) => {
    switch (type) {
      case 'tizzyStart':
        terminalReporter.start((detail as any).headline)
        break
      case 'tizzyEnd':
        terminalReporter.end((detail as any).noftests)
        break
      case 'tizzySuccess':
        terminalReporter.success((detail as any).testname)
        break
      case 'tizzyFailure':
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

import { Page } from 'puppeteer'

export async function createBrowser(puppeteer) {
  return await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--disable-web-security', '--allow-file-access-from-files'],
  })
}

export function setupPageConsoleHandler(page: Page) {
  page.on('console', (msg) => {
    console.log(`console ${msg.type()}:`, msg.text())
    if (msg.type() === 'error') {
      for (let i = 0; i < msg.args().length; i++) {
        console.log(msg.args()[i])
      }
    }
  })
}

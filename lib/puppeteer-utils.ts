import { Page } from 'puppeteer'

export async function createBrowser(puppeteer) {
  return await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    // '--disable-web-security',
    args: ['--allow-file-access-from-files'],
  })
}

export function setupPageConsoleHandler(page: Page) {
  page.on('console', (msg) => {
    // if (msg.type() !== 'debug') {
    console.log(`console ${msg.type()}:`, msg.text())
    // }
    // if (msg.type() === 'error') {
    //   for (let i = 0; i < msg.args().length; i++) {
    //     console.log(msg.args()[i])
    //   }
    // }
  })
}

import puppeteer, { Browser, ElementHandle, Page } from 'puppeteer'

async function createBrowser(puppeteer) {
  return await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--disable-web-security', '--allow-file-access-from-files'],
  })
}

async function openApp(browser: Browser): Promise<Page> {
  const context = await browser.createIncognitoBrowserContext()
  const page = await context.newPage()
  await page.goto(`http://localhost:3000/app/example/`)
  page.on('pageerror', (e) => {
    console.error(`error occurred: `, e)
  })
  page.on('console', (msg) => {
    console.info(`console ${msg.type()}:`, msg.text())
  })
  return page
}

export async function testWithBrowser(testName: string, t: (page: Page) => Promise<void>) {
  const browser = await createBrowser(puppeteer)
  const page: Page = await openApp(browser)
  try {
    await t(page)
  } catch (e) {
    console.error(`Error executing E2E test '${testName}'`)
    console.debug(await page.evaluate(() => document.body.innerHTML))
    throw e
  } finally {
    await browser.close()
  }
}

export async function classes(node: ElementHandle<Element>): Promise<string[]> {
  return await node.evaluate((el) => [...el.classList])
}

export async function textContent(node: ElementHandle<Element>): Promise<string> {
  return await node.evaluate((n) => (n as HTMLElement).innerText)
}

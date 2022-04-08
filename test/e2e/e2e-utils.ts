import puppeteer, { Browser, Page } from 'puppeteer'

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
  return page
}

export async function testWithBrowser(t: (page: Page) => Promise<void>) {
  const browser = await createBrowser(puppeteer)
  try {
    const page: Page = await openApp(browser)
    await t(page)
  } finally {
    await browser.close()
  }
}

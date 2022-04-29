import { createBrowser } from 'lib/puppeteer-utils'
import puppeteer, { Browser, ElementHandle, Page } from 'puppeteer'

async function openApp(browser: Browser): Promise<Page> {
  const context = await browser.createIncognitoBrowserContext()
  const page = await context.newPage()
  await page.goto(`http://localhost:3000/app/example/`)
  page.on('console', (msg) => {
    console.info(`console ${msg.type()}:`, msg.text())
  })
  return page
}

export async function testWithBrowser(testName: string, t: (page: Page) => Promise<void>) {
  const browser = await createBrowser(puppeteer)
  const page: Page = await openApp(browser)
  const pageErrors = []
  page.on('pageerror', (e) => {
    pageErrors.push(e)
  })
  try {
    await t(page)
    if (pageErrors.length > 0) {
      pageErrors.forEach((pe) => {
        console.error(`Page error in ${testName}: `, pe)
      })
      throw Error(`Page errors were caught while executing test`)
    }
  } catch (e) {
    console.error(`Error executing E2E test '${testName}'`)
    // console.debug(await page.evaluate(() => document.body.innerHTML))
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

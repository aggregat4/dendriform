import expect from 'ceylon'
import puppeteer, { Page } from 'puppeteer'
import server from './tiny-dendriform-server'

async function createBrowser() {
  return await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--disable-web-security', '--allow-file-access-from-files'],
  })
}

async function openApp(page: Page) {
  return await page.goto(`http://localhost:3000/app/example/`)
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
export default (async () => {
  console.log(`got a server from tiny: ${server}`)

  const browser = await createBrowser()
  try {
    const context = await browser.createIncognitoBrowserContext()
    const page = await context.newPage()
    await openApp(page)

    const rootNode = await page.waitForSelector('div#ROOT')
    await page.click('button#addNode')
    const newNode = await rootNode.waitForSelector('div.node')
    const classes = await newNode.evaluate((el) => [...el.classList])
    expect(classes.includes('root')).toBeFalse('New node should not be root node')
  } finally {
    await browser.close()
    server.close()
  }
  return Promise.resolve()
})()

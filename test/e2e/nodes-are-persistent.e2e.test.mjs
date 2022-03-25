import server from './tiny-dendriform-server.mjs'
import puppeteer from 'puppeteer'

async function createBrowser() {
  return await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--disable-web-security', '--allow-file-access-from-files'],
  })
}

console.log(`got a server from tiny: ${server}`)

const browser = await createBrowser()
const context = await browser.createIncognitoBrowserContext()
const page = await context.newPage()
await page.goto(`http://localhost:3000/app/example/`)
await page.waitForSelector('div#ROOT')
console.debug(`got root node`)
await browser.close()
await server.close()

import puppeteer from 'puppeteer'
import fs from 'fs'

(async () => {
  // Set puppeteer up so we can do all our tests including indexeddb
  const browser = await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: ['--disable-web-security', '--allow-file-access-from-files']
  })
  const page = await browser.newPage()
  page.on('pageerror', (e) => {
    console.log(`page error occurred: `, e)
  })
  page.on('console', (e) => {
    console.log(`page console event: `, e)
  })
  // let content = fs.readFileSync('./integration-tests/integration-tests.html', 'utf8')
  // console.log(`page content: `, content)
  // await page.setContent(content)
  await page.goto(`file://${process.cwd()}/integration-tests/integration-tests.html`)
  try {
    await page.waitForSelector('#integration-test-status', {timeout: 5000})
    const status = await page.evaluate(() => {
      return window['integrationTestStatus'] || 'status div found, but no status stored'
    })
    console.log(`integration test status: `, status)
  } catch (error) {
    console.log(`integration test error: `, error)
  } finally {
    await browser.close();
  }
})();

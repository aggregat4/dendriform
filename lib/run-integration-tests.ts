import puppeteer from 'puppeteer'

// run all the test
// eslint-disable-next-line @typescript-eslint/no-floating-promises
;(async () => {
  // Set puppeteer up so we can do all our tests including indexeddb
  const browser = await puppeteer.launch({
    headless: true,
    // devtools: true,
    // slowMo: 2500,
    ignoreHTTPSErrors: true,
    args: ['--disable-web-security', '--allow-file-access-from-files'],
  })
  const page = await browser.newPage()
  page.on('pageerror', (e) => {
    console.error(`error occurred: `, e)
  })
  page.on('console', (msg) => {
    console.info(`console ${msg.type()}:`, msg.text())
  })
  await page.goto(`file://${process.cwd()}/${process.env.TIZZY_ITEST_RELATIVE_FILENAME}`)
  try {
    await page.waitForSelector('#integration-test-status', { timeout: 15000 })
    const status = await page.evaluate(() => {
      return window['integrationTestStatus'] || 'status div found, but no status stored'
    })
    console.info(`integration test status: `, status)
  } catch (error) {
    console.error(`integration test error: `, error)
  } finally {
    await browser.close()
  }
})()

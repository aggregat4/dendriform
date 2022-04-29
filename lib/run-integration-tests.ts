/* eslint-disable @typescript-eslint/no-explicit-any */
import puppeteer from 'puppeteer'
import { createBrowser } from './puppeteer-utils'
import { installTizzyPuppeteerBridge } from './tizzy-puppeteer-bridge'

// run all the test
// eslint-disable-next-line @typescript-eslint/no-floating-promises
void (async () => {
  // Set puppeteer up so we can do all our tests including indexeddb
  const browser = await createBrowser(puppeteer)
  const page = await browser.newPage()
  page.on('pageerror', (e) => {
    console.error(`error occurred: `, e)
  })
  page.on('console', (msg) => {
    console.info(`console ${msg.type()}:`, msg.text())
  })
  // setup the tizzy to puppeteer bridge so we get terminal output for our tests
  await installTizzyPuppeteerBridge(page)
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

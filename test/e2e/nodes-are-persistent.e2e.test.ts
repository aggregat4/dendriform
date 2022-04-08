import expect from 'ceylon'
import { Page } from 'puppeteer'
import { testWithBrowser } from './e2e-utils'

export default [
  testWithBrowser(async (page: Page) => {
    const rootNode = await page.waitForSelector('div#ROOT')
    await page.click('button#addNode')
    const newNode = await rootNode.waitForSelector('div.node')
    const classes = await newNode.evaluate((el) => [...el.classList])
    expect(classes.includes('root')).toBe(false, 'New node should not be root node')
  }),
]

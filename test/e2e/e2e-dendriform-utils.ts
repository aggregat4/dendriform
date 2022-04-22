import { ElementHandle, Page } from 'puppeteer'

export async function waitForNodesLoaded(page: Page): Promise<ElementHandle<Element>> {
  return await page.waitForSelector('div#ROOT')
}

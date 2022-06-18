import expect from 'ceylon'
import { Page } from 'puppeteer'
import { waitForNodesLoaded } from './e2e-dendriform-utils'
import { testWithBrowser, textContent } from './e2e-puppeteer-utils'

export default [
  testWithBrowser(
    'Trigger the move down action on a node, moves it down one position (if possible)',
    'moving-nodes-doc',
    async (page: Page) => {
      let rootNode = await waitForNodesLoaded(page)
      await page.click('button#addNode')
      const firstNode = await rootNode.waitForSelector('div.node')
      const nameNode = await firstNode.waitForSelector('div.name')
      await nameNode.focus()
      await page.keyboard.type('Foo')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(200)

      await page.keyboard.type('Bar')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(200)

      await page.keyboard.type('Baz')
      await page.waitForTimeout(200)

      rootNode = await waitForNodesLoaded(page)
      // firstNode = await rootNode.$('div.node')
      let childNodes = await rootNode.$$('div.node')
      expect(childNodes.length).toBe(3, `There should be three children of our root node now`)
      // Go to the second node
      let secondNameEl = await childNodes[1].$('div.name')
      await secondNameEl.focus()
      expect(await textContent(secondNameEl)).toBe('Bar')
      // And move it down
      await page.keyboard.down('Alt')
      await page.keyboard.down('Shift')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.up('Alt')
      await page.keyboard.up('Shift')
      await page.waitForTimeout(200)

      childNodes = await rootNode.$$('div.node')
      expect(childNodes.length).toBe(3, `There should still be 3 child nodes after moving one`)
      secondNameEl = await childNodes[1].$('div.name')
      await secondNameEl.focus()
      expect(await textContent(secondNameEl)).toBe(
        'Baz',
        `When we move a node down it switches places with the next node. In this case the third node from before should be the scond node.`
      )
    }
  ),
]

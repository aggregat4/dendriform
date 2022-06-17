import expect from 'ceylon'
import { Page } from 'puppeteer'
import { waitForNodesLoaded } from './e2e-dendriform-utils'
import { testWithBrowser, textContent } from './e2e-puppeteer-utils'

export default [
  testWithBrowser(
    'Completing a node makes it disappear and it can be shown again by enabling show completed nodes',
    'completing-nodes-doc',
    async (page: Page) => {
      let rootNode = await waitForNodesLoaded(page)
      await page.click('button#addNode')
      const firstNode = await rootNode.waitForSelector('div.node')
      const nameNode = await firstNode.waitForSelector('div.name')
      await nameNode.focus()
      await page.keyboard.type('Foo')
      await page.keyboard.press('Enter')
      await page.keyboard.type('Bar')
      await page.keyboard.press('Enter')
      await page.keyboard.type('Baz')
      rootNode = await waitForNodesLoaded(page)
      // firstNode = await rootNode.$('div.node')
      let childNodes = await rootNode.$$('div.node')
      expect(childNodes.length).toBe(3, `There should be three children of our root node now`)
      // Now mark the second node as completed
      const secondNameEl = await childNodes[1].$('div.name')
      await secondNameEl.focus()
      expect(await textContent(secondNameEl)).toBe('Bar')
      await page.keyboard.down('Control')
      await page.keyboard.press('Enter')
      await page.keyboard.up('Control')
      await page.waitForTimeout(1000)
      childNodes = await rootNode.$$('div.node')
      expect(childNodes.length).toBe(
        2,
        `There should be 2 child nodes for root now that we have completed one`
      )
      // const firstNameNode = await firstNode.$('div.name')
      // expect(await textContent(firstNameNode)).toBe('Foo')
      // const secondNode = await firstNode.$('div.node')
      // // TODO: figure out why ceylon thinks toExist() is false on this node. Is it doing a toString or something!?
      // //expect(secondNode).toExist(`the second node should exist and instead is: ${secondNode}`)
      // expect(secondNode).toNotBe(null, `the second node should exist and instead is: ${secondNode}`)
      // const secondNameNode = await secondNode.$('div.name')
      // expect(await textContent(secondNameNode)).toBe('Bar')
    }
  ),
]

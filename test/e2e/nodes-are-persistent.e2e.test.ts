import expect from 'ceylon'
import { Page } from 'puppeteer'
import { waitForNodesLoaded } from './e2e-dendriform-utils'
import { classes, testWithBrowser, textContent } from './e2e-puppeteer-utils'

// const delay = (ms) => new Promise((res) => setTimeout(res, ms))

export default [
  testWithBrowser(
    'Adding one node to an empty document',
    'adding-node-to-empty-doc',
    async (page: Page) => {
      // NOTE: we MUST wait for the root node to appear since in the beginning
      // we are waiting to join the replicaset and there will be an error div instead!
      const rootNode = await waitForNodesLoaded(page)
      await page.click('button#addNode')
      const newNode = await rootNode.waitForSelector('div.node')
      expect((await classes(newNode)).includes('root')).toBe(
        false,
        'New node should not be root node'
      )
    }
  ),

  testWithBrowser(
    'Adding two nodes foo and bar and making bar a child of foo with tab',
    'adding-two-nodes-and-indenting',
    async (page: Page) => {
      let rootNode = await waitForNodesLoaded(page)
      await page.click('button#addNode')
      let firstNode = await rootNode.waitForSelector('div.node')
      const nameNode = await firstNode.waitForSelector('div.name')
      await nameNode.focus()
      await page.keyboard.type('Foo')
      await page.keyboard.press('Enter')
      await page.keyboard.type('Bar')
      await page.keyboard.press('Tab')
      // NOTE: I am refetching these nodes since otherwise the 'secondNode' selector will fail!
      // this is probably because the original node's context is no longer valid when
      // it has been detached from the document and I think that may be lit doing that
      // as it rerenders portions of the page. This is important to take into account
      // for future tests!
      rootNode = await page.$('div#ROOT')
      firstNode = await rootNode.$('div.node')
      const firstNameNode = await firstNode.$('div.name')
      expect(await textContent(firstNameNode)).toBe('Foo')
      const secondNode = await firstNode.$('div.node')
      expect(secondNode).toExist()
      const secondNameNode = await secondNode.$('div.name')
      expect(await textContent(secondNameNode)).toBe('Bar')
    }
  ),
]

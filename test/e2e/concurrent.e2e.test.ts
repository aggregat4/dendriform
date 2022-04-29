import expect from 'ceylon'
import { Page } from 'puppeteer'
import { waitForNodesLoaded } from './e2e-dendriform-utils'
import { testWithBrowser, textContent } from './e2e-puppeteer-utils'

export default [
  testWithBrowser('Adding nodes in two browsers', async (pageAlpha: Page) => {
    await testWithBrowser('subtest of concurrent test', async (pageBeta: Page) => {
      console.debug(`DEBUG: starting nested test`)
      // we wait for initialisation of both pages
      const rootNodeAlpha = await waitForNodesLoaded(pageAlpha)
      let rootNodeBeta = await waitForNodesLoaded(pageBeta)
      // First create some nodes on page 1
      console.debug(`DEBUG: adding nodes to page 1`)
      await pageAlpha.click('button#addNode')
      const firstNodeAlpha = await rootNodeAlpha.waitForSelector('div.node')
      const nameNodeAlpha = await firstNodeAlpha.waitForSelector('div.name')
      await nameNodeAlpha.focus()
      await pageAlpha.keyboard.type('Foo')
      await pageAlpha.keyboard.press('Enter')
      await pageAlpha.keyboard.type('Bar')
      await pageAlpha.keyboard.press('Tab')
      // Now see whether these changes arrive on page 2
      console.debug(`DEBUG: waiting for changes to page 2`)
      rootNodeBeta = await waitForNodesLoaded(pageBeta)
      console.debug(`DEBUG: waiting for first node on page 2`)
      const firstNodeBeta = await rootNodeBeta.waitForSelector('div.node')
      const firstNameNodeBeta = await firstNodeBeta.waitForSelector('div.name')
      expect(await textContent(firstNameNodeBeta)).toBe('Foo')
      console.debug(`DEBUG: waiting for second node on page 2`)
      const secondNodeBeta = await firstNodeBeta.$('div.node')
      expect(secondNodeBeta).toExist()
      const secondNameNodeBeta = await secondNodeBeta.$('div.name')
      expect(await textContent(secondNameNodeBeta)).toBe('Barasdasdasd')
    })

    // let rootNode = await waitForNodesLoaded(page)
    // await page.click('button#addNode')
    // let firstNode = await rootNode.waitForSelector('div.node')
    // const nameNode = await firstNode.waitForSelector('div.name')
    // await nameNode.focus()
    // await page.keyboard.type('Foo')
    // await page.keyboard.press('Enter')
    // await page.keyboard.type('Bar')
    // await page.keyboard.press('Tab')
    // // NOTE: I am refetching these nodes since otherwise the 'secondNode' selector will fail!
    // // this is probably because the original node's context is no longer valid when
    // // it has been detached from the document and I think that may be lit doing that
    // // as it rerenders portions of the page. This is important to take into account
    // // for future tests!
    // rootNode = await page.$('div#ROOT')
    // firstNode = await rootNode.$('div.node')
    // const firstNameNode = await firstNode.$('div.name')
    // expect(await textContent(firstNameNode)).toBe('Foo')
    // const secondNode = await firstNode.$('div.node')
    // expect(secondNode).toExist()
    // const secondNameNode = await secondNode.$('div.name')
    // expect(await textContent(secondNameNode)).toBe('Bar')
  }),
]

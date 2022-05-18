import expect from 'ceylon'
import { Page } from 'puppeteer'
import { waitForNodesLoaded } from './e2e-dendriform-utils'
import { testWithBrowser, textContent } from './e2e-puppeteer-utils'

export default [
  testWithBrowser(
    'Adding nodes in two browsers',
    'concurrent-add-nodes',
    async (pageAlpha: Page, documentName: string) => {
      await testWithBrowser(
        'subtest of concurrent test',
        documentName, // we want the nested test to use the same document as the outer test so they synchronize on it
        async (pageBeta: Page) => {
          console.debug(`DEBUG: starting nested test`)
          // we wait for initialisation of both pages
          const rootNodeAlpha = await waitForNodesLoaded(pageAlpha)
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
          const rootNodeBeta = await waitForNodesLoaded(pageBeta)
          console.debug(`DEBUG: waiting for first node on page 2`)
          const firstNodeBeta = await rootNodeBeta.waitForSelector('div.node')
          const firstNameNodeBeta = await firstNodeBeta.waitForSelector('div.name')
          expect(await textContent(firstNameNodeBeta)).toBe('Foo')
          console.debug(`DEBUG: waiting for second node on page 2`)
          const secondNodeBeta = await firstNodeBeta.$('div.node')
          expect(secondNodeBeta).toExist()
          const secondNameNodeBeta = await secondNodeBeta.$('div.name')
          expect(await textContent(secondNameNodeBeta)).toBe('Barasdasdasd')
        }
      )
    }
  ),
]

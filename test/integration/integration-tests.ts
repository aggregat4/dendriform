import { run } from '../../lib/tizzy'
import { ConsoleReporter } from '../../lib/tizzy-console-reporter'

// TODO: this is where I left off. I was hoping to use the no-deps oletus library as my test runner as tizzy was not correctly doing before and after, but oletus depends on nodejs assert functionlity and does not work in the browser.
// I think if I use a similar approach as the current test structure in logmove-repository-test. I should be able to fix tizzytest by just removing the before after shit

import './logmove-storage.test'
import './logmove-repository.test'
import './moveop-tree.test'

// Run tests async since the trun is async
// eslint-disable-next-line @typescript-eslint/no-floating-promises
;(async () => {
  await run(new ConsoleReporter(), 'All Browser Tests')
  const div = document.createElement('div')
  div.setAttribute('id', 'integration-test-status')
  document.body.appendChild(div)
})()

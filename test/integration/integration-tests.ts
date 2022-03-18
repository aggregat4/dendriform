import { run } from '../../lib/tizzy'
import { ConsoleReporter } from '../../lib/tizzy-console-reporter'

import './logmove-storage.test'
import './logmove-repository.test'
import './moveop-tree.test'
import './joinprotocol.test'

// Run tests async since the trun is async
// eslint-disable-next-line @typescript-eslint/no-floating-promises
;(async () => {
  await run(new ConsoleReporter(), 'All Browser Tests')
  const div = document.createElement('div')
  div.setAttribute('id', 'integration-test-status')
  document.body.appendChild(div)
})()

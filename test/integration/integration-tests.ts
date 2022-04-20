import { run } from '../../lib/tizzy'
import { ConsoleReporter } from '../../lib/tizzy-console-reporter'
import './joinprotocol.test'
import './logmove-repository.test'
import './logmove-storage.test'
import './moveop-tree.test'

void (async () => {
  await run(new ConsoleReporter(), 'All Browser Tests')
  const div = document.createElement('div')
  div.setAttribute('id', 'integration-test-status')
  document.body.appendChild(div)
})()

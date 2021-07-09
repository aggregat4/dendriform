import { run } from '../../lib/tizzy'
import { ConsoleReporter } from '../../lib/tizzy-console-reporter'

import './peeridmapper.test'

// Run tests async since the trun is async
;(async () => await run(new ConsoleReporter(), 'All Browser Tests'))()

// TODO: fix this status communication
const div = document.createElement('div')
div.setAttribute('id', 'integration-test-status')
document.body.appendChild(div)

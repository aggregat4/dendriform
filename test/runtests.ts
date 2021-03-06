// Set up a fake dom environment for tests since we are not in the browser (see https://github.com/rstacruz/jsdom-global)
import 'jsdom-global/register'

import { TerminalReporter } from '../lib/tizzy-terminal-reporter'
import { run } from '../lib/tizzy'

// All the tests
import './vectorclock.test'
import './domain-search.test'
import './keyboardshortcut.test'
import './logoot-sequence-wrapper.test'
import './markup.test'
import './util.test'

// Run tests async since the trun is async
;(async () => await run(new TerminalReporter(), 'All Tests'))()

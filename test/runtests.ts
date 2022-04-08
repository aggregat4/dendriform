// Set up a fake dom environment for tests since we are not in the browser (see https://github.com/rstacruz/jsdom-global)
import 'jsdom-global/register'
import { run } from '../lib/tizzy'
import { TerminalReporter } from '../lib/tizzy-terminal-reporter'
// All the tests
import './domain-search.test'
import './keyboardshortcut.test'
import './logoot-sequence-wrapper.test'
import './markup.test'
import './util.test'

void (async () => {
  // Run tests async since the trun is async
  await run(new TerminalReporter(), 'All Tests')
})()

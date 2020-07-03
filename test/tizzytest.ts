import rgb from 'barecolor'

const suite = []
const beforeTests = []
const afterTests = []
const onlyTests = []

export function test(name, fn) {
  suite.push({ name, fn })
}

export function only(name, fn) {
  onlyTests.push({ name, fn })
}

export function before(fn) {
  beforeTests.push(fn)
}
export function after(fn) {
  afterTests.push(fn)
}
export function skip(fn) {
  // intentionally left blank, this function is just a helper for the client to identify skips
}

export async function run(headline) {
  const tests = onlyTests[0] ? onlyTests : suite
  rgb.cyan(headline + ' ')
  for (const t of tests) {
    try {
      for (const fn of beforeTests) await fn()
      await t.fn()
      rgb.gray('• ')
    } catch (e) {
      for (const fn of afterTests) await fn()
      rgb.red(`\n\n! ${test.name} \n\n`)
      prettyError(e)
      return false
    }
  }
  for (const fn of afterTests) await fn()
  rgb.greenln(`✓ ${tests.length}`)
  console.info('\n')
}

function prettyError(e) {
  const msg = e.stack
  if (!msg) return rgb.yellow(e)

  const i = msg.indexOf('\n')
  rgb.yellowln(msg.slice(0, i))
  rgb.gray(msg.slice(i))
}

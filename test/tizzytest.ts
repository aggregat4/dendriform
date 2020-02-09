import rgb from 'barecolor'

const suite = []
const before = []
const after = []
const only = []

export function test(name, fn) {
  suite.push({ name, fn })
}

export function tonly(name, fn) {
  only.push({ name, fn })
}

export function tbefore(fn) { before.push(fn) }
export function tafter(fn) { after.push(fn)  }
export function tskip(fn) {}

export async function trun(headline) {
  const tests = only[0] ? only : suite
  rgb.cyan(headline + ' ')
  for (const t of tests) {
    try {
      for (const fn of before) await fn()
      await t.fn()
      rgb.gray('• ')
    } catch(e) {
      for (const fn of after) await fn()
      rgb.red(`\n\n! ${test.name} \n\n`)
      prettyError(e)
      return false
    }
  }
  for (const fn of after) await fn()
  rgb.greenln(`✓ ${ tests.length }`)
  console.info('\n')
}

function prettyError(e) {
  const msg = e.stack
  if (!msg) return rgb.yellow(e)

  const i = msg.indexOf('\n')
  rgb.yellowln(msg.slice(0, i))
  rgb.gray(msg.slice(i))
}

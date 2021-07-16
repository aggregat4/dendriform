export interface Reporter {
  start(headline: string): void
  end(noftests: number): void
  success(testname: string)
  failure(testname: string, error: Error)
}

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

export async function run(reporter: Reporter, headline: string): Promise<boolean> {
  const tests = onlyTests[0] ? onlyTests : suite
  reporter.start(headline)
  for (const test of tests) {
    try {
      for (const fn of beforeTests) await fn()
      await test.fn()
      reporter.success(test.name)
    } catch (e) {
      for (const fn of afterTests) await fn()
      reporter.failure(test.name, e)
      return false
    }
  }
  for (const fn of afterTests) await fn()
  reporter.end(tests.length)
}

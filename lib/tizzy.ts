export interface Reporter {
  start(headline: string): void
  end(noftests: number): void
  success(testname: string)
  failure(testname: string, error: string | Error)
}

const suite = []

export function test(name, fn) {
  suite.push({ name, fn })
}

export function fail(msg: string) {
  throw new Error(msg)
}

export async function run(reporter: Reporter, headline: string): Promise<boolean> {
  reporter.start(`Running '${headline}' with ${suite.length} tests`)
  let success = true
  for (const test of suite) {
    try {
      await test.fn()
      reporter.success(test.name)
    } catch (e) {
      reporter.failure(test.name, e)
      success = false
    }
  }
  reporter.end(suite.length)
  return success
}

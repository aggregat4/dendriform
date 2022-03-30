import e2ePromise1 from './nodes-are-persistent.e2e.test';

console.log(`E2E Tests Start`)

// eslint-disable-next-line @typescript-eslint/no-floating-promises
;(async () => {
  await e2ePromise1
  console.log(`E2E Tests done`)
})()

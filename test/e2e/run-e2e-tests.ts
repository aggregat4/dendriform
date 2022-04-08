import tests1 from './nodes-are-persistent.e2e.test'
import server from './tiny-dendriform-server'

void (async () => {
  console.log(`E2E Tests Start`)
  try {
    await Promise.all(tests1)
    console.log(`E2E Tests done`)
  } finally {
    server.close()
  }
})()

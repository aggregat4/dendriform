import tests3 from './completing-nodes.e2e.test'
import tests2 from './concurrent.e2e.test'
import tests1 from './nodes-are-persistent.e2e.test'
import dendriformApp from './tiny-dendriform-server'

void (async () => {
  console.log(`E2E Tests Start`)
  const server = dendriformApp.listen(3000)
  try {
    await Promise.all(tests1)
    await Promise.all(tests2)
    await Promise.all(tests3)
    console.log(`E2E Tests done`)
  } finally {
    server.close()
  }
})()

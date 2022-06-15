import tinyServer from './tiny-dendriform-server'

void (async () => {
  console.log(`Tiny Server Start`)
  tinyServer.listen(3000)
})()

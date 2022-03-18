import Koa from 'koa'
import serve from 'koa-static'
import mount from 'koa-mount'

const app = new Koa()

// response
// app.use((ctx) => {
//   ctx.body = 'Hello Koa'
// })

const staticFiles = serve('dist/')

app.use(mount('/app', staticFiles))

app.listen(3000)
console.log('listening on port 3000')

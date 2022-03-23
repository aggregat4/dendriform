import Koa from 'koa'
import serve from 'koa-static'
import mount from 'koa-mount'
import Router from '@koa/router'
import logger from 'koa-logger'

const app = new Koa()
app.use(logger())

const staticFiles = serve('dist/')
app.use(mount('/app', staticFiles))

// documentId -> {replicaSet, events}
// replicaSet: {replicaId -> clock}
// events: {replicaId -> Event[]}
const documents = {}

const router = new Router()
router
  .put('/documents/:documentId/replicaset/:replicaId', async (ctx) => {
    const documentId = ctx.params.documentId
    const replicaId = ctx.params.replicaId
    if (!documents[documentId]) {
      documents[documentId] = {
        replicaSet: {},
        events: {},
      }
    }
    if (!documents[documentId].replicaSet[replicaId]) {
      // TODO: verify whether -1 is really the right initial value
      documents[documentId].replicaSet[replicaId] = -1
      documents[documentId].events[replicaId] = []
      ctx.response.body = { alreadyKnown: false }
    } else {
      ctx.response.body = { alreadyKnown: true }
    }
  })
  .post('/documents/:documentId/replicaset/:replicaId/events', async (ctx) => {
    const documentId = ctx.params.documentId
    const clientReplicaId = ctx.params.replicaId
    const batchSize = ctx.params.batchSize
    const payload = ctx.request.body
    if (!documents[documentId]) {
      ctx.throw(404, 'this document does not exist')
    }
    if (!documents[documentId].replicaSet[clientReplicaId]) {
      ctx.throw(404, 'has not joined replicaSet yet')
    }
    // update the server side replicaset to mark the new max clock of the client
    if (payload.events && payload.events.length > 0) {
      for (const event of payload.events) {
        if (documents[documentId].replicaSet[clientReplicaId] < event.clock) {
          documents[documentId].replicaSet[clientReplicaId] = event.clock
        }
        documents[documentId].events[clientReplicaId].push(event)
      }
    }
    // based on the clients knowledge of replicas, send hereto unknown events back
    const responseEvents = []
    for (const serverReplicaId of Object.keys(documents[documentId].replicaSet)) {
      if (serverReplicaId !== clientReplicaId) {
        const clientKnownMaxClock = payload.replicaSet[serverReplicaId] || -1
        for (const serverEvent of documents[documentId].replicaSet[serverReplicaId]) {
          if (serverEevent.clock > clientKnownMaxClock) {
            responseEvents.push(serverEvent)
            if (responseEvents.length >= batchSize) {
              break
            }
          }
        }
      }
      if (responseEvents.length >= batchSize) {
        break
      }
    }
    ctx.response.body = {
      events: responseEvents,
      replicaSet: documents[documentId].replicaSet,
    }
  })

app.use(router.routes())

app.listen(3000)
console.log('listening on port 3000')

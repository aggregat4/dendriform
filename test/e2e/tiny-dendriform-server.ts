/*
  This is a minimal, non-persistent implementation of a dendriform backend. 
  It implements the join and sync protocols and uses Koa for its implementation.
 */
import Router from '@koa/router'
import Koa from 'koa'
import bodyParser from 'koa-body'
import logger from 'koa-logger'
import mount from 'koa-mount'
import serve from 'koa-static'
import { MoveOp } from 'src/ts/moveoperation/moveoperation-types'

const app = new Koa()
if (!!process.env.TIZZY_DEBUG) {
  app.use(logger())
}
app.use(bodyParser())

const staticFiles = serve('dist/')
app.use(mount('/app', staticFiles))

type EventsPerReplica = {
  [key: string]: MoveOp[]
}
type Clock = number
type ReplicaSet = {
  [key: string]: Clock
}
interface Document {
  replicaSet: ReplicaSet
  operations: EventsPerReplica
}
type Documents = {
  [key: string]: Document
}
const documents: Documents = {}

/**
 * The client replicaSet is of a different format as our server replicaset. It is just an array with objects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findMaxKnownClock(replicaSet: any, serverReplicaId: string) {
  for (const replica of replicaSet) {
    if (replica.replicaId === serverReplicaId) {
      return replica.clock
    }
  }
  return -1
}

function findMaxClockInReplicaSet(replicaSet: ReplicaSet) {
  let maxClock = -1
  let k: keyof ReplicaSet
  for (k in replicaSet) {
    if (maxClock < replicaSet[k]) {
      maxClock = replicaSet[k]
    }
  }
  return maxClock
}

const router = new Router()
  .put('/documents/:documentId/replicaset/:replicaId', async (ctx) => {
    const documentId = ctx.params.documentId
    const replicaId = ctx.params.replicaId
    if (!documents[documentId]) {
      documents[documentId] = {
        replicaSet: {},
        operations: {},
      }
    }
    if (documents[documentId].replicaSet[replicaId] === undefined) {
      // the new replica gets a starting clock that is one larger than the largest known clock
      documents[documentId].replicaSet[replicaId] =
        findMaxClockInReplicaSet(documents[documentId].replicaSet) + 1
      documents[documentId].operations[replicaId] = []
    }
    ctx.response.body = documents[documentId].replicaSet
  })
  .post('/documents/:documentId/replicaset/:replicaId/ops', async (ctx) => {
    const documentId = ctx.params.documentId
    const clientReplicaId = ctx.params.replicaId
    const batchSize = parseInt(ctx.params.batchSize)
    const payload = ctx.request.body
    if (!documents[documentId]) {
      console.debug(`document not known: ${documentId}`)
      ctx.throw(404, 'this document does not exist')
    }
    if (documents[documentId].replicaSet[clientReplicaId] === undefined) {
      console.debug(`replica not known: ${clientReplicaId}`)
      ctx.throw(404, 'has not joined replicaSet yet')
    }
    // update the server side replicaset to mark the new max clock of the client
    if (payload.operations && payload.operations.length > 0) {
      console.debug(`Receiving ${payload.operations.length} events`)
      for (const event of payload.operations) {
        if (documents[documentId].replicaSet[clientReplicaId] < event.clock) {
          documents[documentId].replicaSet[clientReplicaId] = event.clock
        }
        documents[documentId].operations[clientReplicaId].push(event)
      }
    }
    console.debug(
      `client has sent replicaset: `,
      payload.replicaSet,
      ` with `,
      payload.operations.length,
      ` operations`
    )
    // based on the client's knowledge of replicas, send hitherto unknown events back
    const responseEvents = []
    for (const serverReplicaId of Object.keys(documents[documentId].replicaSet)) {
      if (serverReplicaId !== clientReplicaId) {
        // TODO: this is wrong, the client replicaset is an array of objects, not a dictionary itself
        const clientKnownMaxClock = findMaxKnownClock(payload.replicaSet, serverReplicaId)
        console.debug(
          `client knows maximum clock ${clientKnownMaxClock} for replica ${serverReplicaId}`
        )
        for (const serverEvent of documents[documentId].operations[serverReplicaId]) {
          if (serverEvent.clock > clientKnownMaxClock) {
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
    if (responseEvents.length > 0) {
      console.debug(
        `server sending back ${responseEvents.length} events to client ${clientReplicaId}`
      )
    }
    ctx.response.body = {
      operations: responseEvents,
      replicaSet: Object.entries(documents[documentId].replicaSet).map((arr) => {
        return {
          replicaId: arr[0],
          clock: arr[1],
        }
      }),
    }
  })

app.use(router.routes())

export default app

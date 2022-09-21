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
type Replica = {
  replicaId: string
  clock: number
}
type ReplicaSet = {
  replicas: Replica[]
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
function findMaxKnownClock(replicaSet: ReplicaSet, serverReplicaId: string) {
  for (const replica of replicaSet.replicas) {
    if (replica.replicaId === serverReplicaId) {
      return replica.clock
    }
  }
  return -1
}

function findMaxClockInReplicaSet(replicaSet: ReplicaSet) {
  let maxClock = -1
  for (const replica of replicaSet.replicas) {
    maxClock = Math.max(replica.clock, maxClock)
  }
  return maxClock
}

function findReplica(replicaSet: ReplicaSet, replicaId: string): Replica {
  for (const replica of replicaSet.replicas) {
    if (replica.replicaId === replicaId) {
      return replica
    }
  }
  return null
}

const router = new Router()
  // JOIN
  .put('/documents/:documentId/replicaset/:replicaId', async (ctx) => {
    const documentId = ctx.params.documentId
    const replicaId = ctx.params.replicaId
    if (!documents[documentId]) {
      documents[documentId] = {
        replicaSet: { replicas: [] },
        operations: {},
      }
    }
    if (!findReplica(documents[documentId].replicaSet, replicaId)) {
      // the new replica gets a starting clock that is one larger than the largest known clock
      documents[documentId].replicaSet.replicas.push({
        replicaId: replicaId,
        clock: findMaxClockInReplicaSet(documents[documentId].replicaSet) + 1,
      })
      documents[documentId].operations[replicaId] = []
    }
    ctx.response.body = documents[documentId].replicaSet
  })
  // SYNC
  .post('/documents/:documentId/replicaset/:replicaId/ops', async (ctx) => {
    const documentId = ctx.params.documentId
    const clientReplicaId = ctx.params.replicaId
    const batchSize = parseInt(ctx.params.batchSize)
    const payload = ctx.request.body
    if (!documents[documentId]) {
      console.debug(`document not known: ${documentId}`)
      ctx.throw(404, 'this document does not exist')
    }
    const clientReplica = findReplica(documents[documentId].replicaSet, clientReplicaId)
    if (!clientReplica) {
      console.debug(`replica not known: ${clientReplicaId}`)
      ctx.throw(404, 'has not joined replicaSet yet')
    }
    // update the server side replicaset to mark the new max clock of the client
    if (payload.operations && payload.operations.length > 0) {
      console.debug(`Receiving ${payload.operations.length} events`)
      for (const event of payload.operations) {
        clientReplica.clock = Math.max(clientReplica.clock, event.clock)
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
    for (const serverReplica of documents[documentId].replicaSet.replicas) {
      if (serverReplica.replicaId !== clientReplicaId) {
        // TODO: this is wrong, the client replicaset is an array of objects, not a dictionary itself
        const clientKnownMaxClock = findMaxKnownClock(payload.replicaSet, serverReplica.replicaId)
        console.debug(
          `client knows maximum clock ${clientKnownMaxClock} for replica ${serverReplica.replicaId}`
        )
        for (const serverEvent of documents[documentId].operations[serverReplica.replicaId]) {
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

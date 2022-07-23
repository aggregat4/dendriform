// import { deleteDB } from 'idb'
// import { deinitAll, initAll, register } from 'src/ts/domain/lifecycle'
// import { MoveOpTree } from 'src/ts/moveoperation/moveoperation'
// import { JoinProtocol } from 'src/ts/replicaset/join-protocol'
// import { SyncProtocol } from 'src/ts/replicaset/sync-protocol'
// import { SyncProtocolClient } from 'src/ts/replicaset/sync-protocol-client'
// import { IdbDocumentSyncStorage } from 'src/ts/storage/idb-documentsyncstorage'
// import { IdbLogMoveStorage } from 'src/ts/storage/idb-logmovestorage'
// import { IdbReplicaStorage } from 'src/ts/storage/idb-replicastorage'
// import { IdbTreeStorage } from 'src/ts/storage/idb-treestorage'

// function testWithSyncProtocol(
//   syncProtocolClient: SyncProtocolClient,
//   t: (syncProtocol: SyncProtocol) => Promise<void>
// ): () => void {
//   return async () => {
//     const initializables = []
//     const replicaStore = register(new IdbReplicaStorage('replicastoredb'), initializables)
//     const documentSyncStore = register(
//       new IdbDocumentSyncStorage('documentsyncstoragedb'),
//       initializables
//     )
//     const joinProtocol = register(
//       new JoinProtocol(documentSyncStore, 'doc1', replicaStore, syncProtocolClient, true),
//       initializables
//     )
//     const logMoveStore = register(
//       new IdbLogMoveStorage('logmovestoredb', joinProtocol),
//       initializables
//     )
//     const treeStore = register(new IdbTreeStorage('treestoredb'), initializables)
//     const moveOpTree = register(
//       new MoveOpTree(replicaStore, logMoveStore, treeStore),
//       initializables
//     )
//     const syncProtocol = register(
//       new SyncProtocol(
//         documentSyncStore,
//         joinProtocol,
//         'doc1',
//         moveOpTree,
//         syncProtocolClient,
//         replicaStore
//       ),
//       initializables
//     )
//     await initAll(initializables)
//     try {
//       await t(syncProtocol)
//     } finally {
//       await deinitAll(initializables)
//       await deleteDB('treestoredb')
//       await deleteDB('logmovestoredb')
//       await deleteDB('documentsyncstoragedb')
//       await deleteDB('replicastoredb')
//     }
//   }
// }

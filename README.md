# Dendriform

An outliner that runs in the browser and works offline by default. Implemented in Typescript.

CRDT-based peer synchronisation with additional vector clocks for causal sorting and easier garbage collection.

This application is inspired by [Workflowy](http://workflowy.com), the most elegant outliner out there.

## Development

This project uses npm and rollup to build. To get started, do the following:

1. clone the repository
2. perform an `npm install`
3. check out the `package.json` file for the few goals that are provided, for example `npm run watch` will start watching for changes in the files and rebuilds the project if necessary

The sample application can be tested by loading the `dist/index.html` file in your browser.

## Initialisation of the Tree

### Embedding The Tree Component

`src/example/main.ts` is the example program that shows a basic case of initialising the tree on a particular dom element:

```javascript
document.addEventListener('DOMContentLoaded', () => {
  mountTree(document.body)
  updateTree(getRequestedNodeId())
})

window.addEventListener('hashchange', () => updateTree(getRequestedNodeId()))
```

On `DOMContentLoaded` the functions `mountTree` and `updateTree` are called to initialise the tree.

To allow us to react to navigation events (like drilling down on a node) we attach an event listener that will get the requested node id to load from a hash fragment in the URL.

This is just an example, in your own usage you can use whatever navigation you would like. The `getRequestedNodeId` function here defaults to the value `ROOT` if no node id was specified. This is a symbolic name indicating that you want to see the whole tree.

### Dendriform Initialisation

If we look into `mountTree` which is in `src/ts/tree.ts` we can see the initialisation flow of all the components:

```typescript
export function mountTree(el: HTMLElement): void {
  initPromise.then(() => {
    mount(el, tree)
    opmlInit(tree.getTreeElement())
  })
}
```

`mountTree` requires a DOM element where the web component should be hung but it does this only when the initialisation has finised. This is embodied in the `initPromise`:

```typescript
const initPromise = localEventLog
  .init()
  .then(() => eventPump.init())
  .then(() => eventPump.start())
  .then(() => repository.init())
```

This starts all _active_ components in the correct order:

1. The local event log is the backing store for all our data, it initialises the indexeddb storage layer and if necessary creates the required tables.
2. The event pump is a mechanism that actively gets events from the remote (central) server and feeds them into the local event log and vice versa. It allows multiple peers to communicate with each other using an intermediary hosted central eventlog.
3. Finally the repository is a layer on top of the local event log that offers a nice tree based API to all our code and abstracts away the fact that the whole storage is event based. It needs to create some datastructures and caches on top of the event log.

## Architectural Strategies

### View Layer

The view layer uses (lit-html)[http://example.com] to render components. This approach does not use virtual dom and instead uses on the fly diffing against the actual dom to incrementally update it. The program started out with a virtual DOM based diffing approach (using Maquette) but that turned out to have unpredictable performance characteristics and did not offer the amount of control over selection and cursor placement that we required.

This program is special in that it is basically a giant tree based structural text editor. Everything is directly editable and can be manipulated and responses need to be as fast as possible so as not to get into the way of the editing experience.

View code is all in `src/ts/view`. The main component is the tree itself in `tree-component.ts`, it consists of recursively nested nodes that are rendered with `node-component.ts`.

### Actions

All user actions are represented by concrete `TreeAction` objects that have a trigger (typically a keyboard shortcut) and an associated handler. Handlers are functions that take a DOM event and a context object and perform the actual logic associated with the operation.

The Action abstraction allows for platform-specific keyboard shortcuts and doing things like triggering operations from the keyboard or from a menu.

All TreeActions are registerd in the `TreeActionRegistry` which acts as the central dispatcher: it is called by the tree component when various DOM events happend and it figures out what action to execute based on its triggers.

Actions do not modify the datastore or the DOM directly, they just construct the command (see Commands below) that model the operation.

### Commands

All mutating GUI actions are modeled as commands in order to support full undo for all operations. User events trigger commands that are both handled locally for updating the DOM directly and are also dispatched to the "backend" to persist them.

Commands always have an inverse command that can be constructed automatically from the original command and used for undoing the operation. This can be continued ad nauseam by creating the reverse of a reverse command for a redo operation for example.

Commands and their infrastructure are in `src/ts/commands`.

### Offline First

Since this program should work without a network connection, it was designed offline first. This means that all the storage is primarily local (in indexeddb) and can optionally be told to synchronize with a server.

### Event Based Storage, CRDTs and Vectorclocks

A further design goal of the program is that it can not only work offline, but that it can work with any number of decentralized peers and that the state will be eventually consistent. The use case is using the program from your desktop, tablet and phone and having a fast editing experience locally but benefit from shared state across all those devices.

The smallest unit of data is a node in the tree. We use an approach that is inspired by CRDTs to model all operations on these nodes as events and to optionally, lazily, asynchronously disseminate these events to other peers using a central server. The CRDT model allows for no explicit coordination between the peers and guarantees an eventually consistent state.

In order to make garbage collection easier we extended all events with vector clocks. Combining the vector clock partial causal ordering with a sorting criteria by node id allows us to have a total order over all events that is consistent over all nodes.

There are 3 types of events that each represent a CRDT managed data structure:

- The node contents themselves are modeled as a set of things
- The parent-child relationships between nodes are managed as a set of parent-child relationship tuples
- The ordering of the children of a parent is modeled as a set of "logoot" sequences with one logoot sequence per parent

No data is actively deleted, all "deleted" nodes remain in the set as tombstones.

There is a periodical garbage collection phase that will collect all nodes that are known to be causally redundant and removes them from the event log. This phase does not yet run in a separate thread (web worker) and causes (small) pauses.

### Preventing Cycles

Since two clients can work disconnected for a while, it is possible that they may both emit events that are perfectly valid locally but that can cause cycles when merging together. If client 1 reparents B under A, and client 2 reparenty A under B we have a de facto conflict that can not be solved simply by CRDT approaches.

The implemented solution for this is to reject all reparenting events that would cause a cycle. Since we always process all events in (total) causal order we can be sure that the system will converge on the same state across clients.

The downside here is that we need a cycle check for each reparenting operation when rebuilding the structure maps in `repository-eventlog.ts`.

### Garbage Collection Using RAF

Garbage Collection of events is still not happening in a Webworker and therefore not truly parallel. To mitigate the impact on the user experience the histogram creation part of the regular garbage collection cycle is throttled to at most take one animation frame of effort by using RequestAnimationFrame and timing the operations.

What's missing is to also throttle the actual garbage collection itself (deleting events) with RAF and real world testing to validate that this does prevent UI jank.

## TODOs

1. BUG: when text has markup I lose focus after typing one additional character
1. BUG: Undo is broken
1. IMPROVEMENT: When splitting a node with a note, the note should only move to the new node when we don't split at the end of the name (see workflowy)
1. IMPROVEMENT: When joining a test replicaset with a new browser it connects to the server and syncs events but between the notice that we are trying to connect to the server disappearing and the tree to appear there is a period of blank nothingness that could be quite disorienting when it then suddenly pops in. Optimally we would have some activity indicator showing that stuff is happening
1. IMPROVEMENT: try to migrate the tree component to shadow DOM with an import of the shared styles and by moving tree.css into the component.
1. Extend tizzy to include the ability to "describe", meaning to add structure to tests so that you can have like a global context but still individually described test steps that are documented
```
describe('something' , () => { 
  describe('another level', () => {
    test('actual test',() => {

    })
  })
})
```
Something like testWithRepo could just be delegating to describe but how would I solve passing a function with specific parameters to nested describes? Some generics trickery?
1. EXPERIMENT: maybe consider trying https://talwindcss.com/ and give that a go here. I am curious how it feels.
1. IMPROVEMENT: make pagedown and page up move the cursor as well? Check in other apps
1. Add a feature to quickly move nodes to another parent node. Either with a bunch of fixed targets and autocomplete and remembering the last used? is last used an antipattern since you may need a different one each time? Or based on tags somehow? Or autocomplete on all nodes with last used?
1. Put all the (sensible) standard actions into menuitems for the node popup
1. As long as we don't support formatting the importer needs to strip all HTML tags and optionally convert some tags to markdown?
1. Implement import by pasting into a text area.
1. Test with touch
1. Implement multi-select and delete and move operations (at least with keyboard)
1. Escape should dismiss dialogs
1. We need some sort of versioning support: when the software evolves and it is running "in production" we need a way to gracefully upgrade. Our two external interfaces are the remote events and the local indexeddb storage of events. The local store can theoretically be recreated completely but we need to identify the version change, remote events we could maybe transform?
1. Check if it works on iOS and Android
1. i18n
1. (also consider search in i18n, maybe other find mechanism? [regex?](https://stackoverflow.com/a/38151393/1996) )
1. Implement a global inbox capture feature: some shortcut to popup some input box whose contents get added as last child to some dedicated inbox node) (what node though? config? hmm)
1. Override pasting of text to have more control: workflowy does some intelligent things with newlines, etc
1. Accessibility: is that even possible with this tree? How do I make the commands accessible? Do I need a menu per item anyway? How can I make moving a node in the tree accessible?
1. MAYBE Implement moving up and down with arrow keys and maintaining approximate character position
1. MAYBE Implement fancier UNDO for text: if I ever want fancier undo like in sublime text (on whitespace boundaries) then I need to actually handle direct keydown events and determine the input events myself because here I can no longer (easily) discern between single character updates and some larger input events like pasting or CTRL+BACKSPACE
1. Make dialog positioning smarter by taking into account how much room we have on all sides.

# Dendriform

A web based outliner with offline capabilities.

This application is heavily inspired by [Workflowy](http://workflowy.com), one of the most elegant outliners out there.

It uses pouchdb for local persistence and maquette js for rendering.

It is currently mostly a playground and personal project for learning client side technologies better, but may actually become usable enough to work with.

## Useful links

* `package.json` spec: https://docs.npmjs.com/files/package.json

## Project Development

### Development Tooling

This project uses npm and webpack to build. To get started, do the following:

1. clone the repository
2. perform an `npm install`
3. check out the `package.json` file for the few goals that are provided, for example `npm run watch' will start watching for changes in the files and rebuilds the project if necessary

The application can be tested by loading the `dist/index.html` file in your browser.

### Webpack

install?

### Build Tools

Some tools needed for the various build goals:

`npm install parallelshell --save-dev`
`npm install onchange --save-dev`
`npm install http-server --save-dev`
`npm install typescript --save-dev`
`npm install ts-loader --save-dev`
`npm install tslint --save-dev`

## Next Steps

1. Start a new branch with the direct DOM rendering approach and alternate Command implementation that does direct dom manipulation. See performance chapter down here. Following plan:
  - I am creating commands that don't have functions in them, this needs to be finised and refactored in tree-component.
  - These commands can then be executed multiple times. There needs to be a CommandExecutor for the current PouchDb backend and we need on that just modifies the local store.
  - Still to figure out: I still feel that we need a synchronous API to the tree-api that modifies the local store, and we "just" need to send off the async commands to the pouchdb thing. 
  - Also: note that we don't really need to take into account that focus and reload stuff from the couchdb backend right? Maybe that also influences the API.
  - Current state (17.1.2018) working on the command executor in tree-api, got a basic idea and classes, need to finish command dispatching, then updating the code in tree-component and then testing, also implement the local store executor!
  - State 19.1.2018: need to refactor modules (see diagram): introducing a tree manager that handles undo/redo and is the interface implementation to the actual tree component. In addition we make a CachingTreeService that is initialized with another TreeService (e.g. PouchDbTreeService) and then implements the load/initempty/getstore methods in terms of delegating to the underlying service
  - State 2.2.2018:
    I have split the Treeservices in 3 layers: Manager -> Caching -> PouchDb.
    I have have decided to fully work with client side generated IDs for the nodes (UUIDs) which means that we no longer require information fromm the backing store to generate UNDO commands.
    The logic for creating the UDO Command from a command needs to be moved to the payload (from the pouchdb implementation).
    This means that undo commands can be generated and managed completely by the manager that also has the undo/redo stacks.
    Then it should be possible to do the local implementation in CachingTreeService and then try to wire everything up with 
    the component. Jezus.
  - State 14.2.2018
    As I was implementing the local tree service it was obvious that all implementations were identical to the ones
    for the pouchdb service, module the async with the promises. This indicated to me that the difference between local
    and pouchdb exists at the Repository level: there are some basic functions like create/save/delete/.. that are platform
    specific, but because of the generic data model that I have that is the ONLY level. All higher level functions can be
    reused (probably).
    So current state: moved reusable functions into PouchDbTreeService, which will have to become a "normal" TreeService and
    "just" get its repository implementation injected.
    Need to create a Local Repository impl
    Need to deal with the loadTree conundrum, this was a reason for not further abstracting before this. My solution may simple be to ALSO add an "initTree(tree)" to the Repository API so that a repo can either be asked to load the entire
    tree from storage OR to just take an existing tree and use that. At a first go I could just throw an error when calling
    this on PouchDb. It is then up to the caching TreeService implementation to cleverly decide where it will load and where it will init. This makes way more sense.
    <sigh>
    It seems like a lot of wrong tracks to find the correct abstraction, but perhaps that's normal?
    Also: I am starting to think that our performance problem may not be the storage, but rather just the VDOM rendering, if that is the case I may need to refactor the frontend as well, and that may be nasty and a lot of work, and the local tree storage may have been in vain... At least I had some interesting insights because of the UNDO/REDO work and now that we moved UMDO command creation INTO the commands, it feels much better. But also only possible because of client side ID generation!
  - State 16.2.2018
    Done most of the refactoring, I've arrived back at the frontend and need to fix 2 remaining things in the tree.component:
    - Does it have an internal cache of the tree for rerendering purposes? If so, where and how is it managed? Does it get it from the UndoableTreeService?
    - I'm a bit flummoxed by the exec() in tree-component and am wondering where the focus information there should be coming from. Perhaps I need to review the master branch to see where this was.
1. Refactor the module structure, no cyclic dependencies and remove implementations to own modules
1. Implement breadcrumbs for navigating back
1. First round of prettyfication of the UI (investigate some information hierarchy, ux, similar stuff))
1. Implement navigating to the end and beginning of the tree with CTRL+HOME/END (or whatever the mac equivalent is?)
1. Implement export in some standard format
1. Implement import in some standard format
1. Implement OPEN and CLOSED nodes
1. Implement a global inbox capture feature: some shortcut to popup some input box whose contents get added as last child to some dedicated inbox node)
1. Check if it works on iOS, we possibly need to do as suggested in https://stackoverflow.com/a/45954914/1996 (call rendernow to trigger focus)
1. Implement search (with https://github.com/pouchdb-community/pouchdb-quick-search perhaps?)
1. Override pasting of text to have more control: workflowy does some intelligent things with newlines, etc
1. Implement fancier UNDO for text: if I ever want fancier undo like in sublime text (on whitespace boundaries) then I need to actually handle direct keydown events and determine the input events myself because here I can no longer (easily) discern between single character updates and some larger input events like pasting or CTRL+BACKSPACE
1. Implement a cleanup process that periodically sweeps the tree and collects incorrectly hung nodes in a LOST+FOUND node?
1. Implement a data saving error handler so we can do a reasonable number of retries or recovery for any update on the repository, but in the end of penultimate failure, notify the caller of this and have the tree track the lost updates in a separate space
1. Implement custom debouncing/queueing for rename updates: just track the latest rename value, then periodically with setInterval, persist this change and also when performing another action like splitting, persist this change. The current system looks good, but can run into conflicted updates in the data store.
1. Performance is going to be shit with bigger trees: we always reload the entire tree on structural changes, this is easier to implement but very inefficient.
1. Implement moving up and down with arrow keys and maintaining approximate character position

## Ideas

### Unit Testing
Consider adding unit tests with this approach https://www.npmjs.com/package/mocha-webpack

### Performance
We have a problem with our current model: since we use a virtual dom approach we need to rely on that to reflect changes in our model. Currently the model is always loaded from pouchdb, that is "the truth". This has the disadvantage that (async) updates in pouchdb need to happen before we can render the changes in the state. This in turn causes delays, and even adds a need for debouncing when operations are very quick and pouchdb does not keep up. This makes the application feel unncessarily slow.

There are two ways around this that I see:
- Separate model: Keep the vdom approach and modify an in memory representation of the tree, serialize all updates to pouchdb and have those happen in the background. Problems here are that we need to store _another_ representation of the tree, and we need a way to deal with async updates coming in through pouchdb from other devices: when do we completely reload the local representation?
- Pure DOM approach: Restart the view layer without maquette, go pure dom, try to use RE:DOM (https://redom.js.org/) perhaps. We could do all local changes directly on the DOM and serialize updates in the background to pouchdb. Here too we need to deal with the background sync issues and how to merge them in.

The two models are more similar then I imagined: they both operate on a local representation of the tree, which in both cases can be partial (think about collapsed nodes) and with both approaches I need to serialize updates to the backing store.

So, current idea: start a new branch where we will implement synchronous commands that operate on the DOM tree and queue all backend repository updates in a serialized queue with pouchdb updates.

Ideas:
- Implement everyhting with getElementById, optionally I could try to optimise to always pass the current node as well since I usually have that, this could obviate a lookup with certain operations.
- A load is a load: always load from backing store and rerender tree. We just need to stop rerendering for everything since we will be (hopefully) in sync
- We should be able to reuse the current pouchdb commands, need to abstract those builders out as an interface and have two implementations?

## Lessons learned

### Promises are tricky

* It is imperative that what is passed to a then() call is actually a function a not just a call to a function that returns a promise. In hindsight this is obvious, but debugging this is nasty.

### Updates need to be serialized

The delayed updates of the rename action (typing a character renames the node) are causing issues: when a rename is debounced and delayed for 250 milliseconds, and you split the same node inside of that window, the node is split and suddenly you have 2 nodes called the same text when the rename finally happens.

We need to debounce to not overload pouchdb, but we can't let the split happen before the rename.

Does this mean we need to serialize updates ourselves? Put all Update commands (without debouncing) in a queue and process that? When do we rerender the tree?

## Software Design

### Flow
On DOM loaded (or hash parameter change to different node), trigger tree store fetch, when promise completes call maquette render function with data objects.

On other events that mutate the tree, send update action to tree store, when promise returns call render.

On navigation events, set the hash value in the URL, call render.

### Runtime Errors

When a runtime error or exception happens, an Error will be thrown. This is used for defensive programming for example.

### Thoughts

#### Incremental Store Loading

The application is moving towards a model where the store is being reloaded completely when something changes, then the virtual dom does some efficient rendering of same. This is probably going to be ok in the short term, since we need to be able to load efficiently initially anyway.

However, optimally we would reduce the need to load things from the database to the bare minimum required. Given that we already load single nodes as individual objects from the pouchdb database, this sets us up for sucess. We "just" need a way to identify what nodes are dirty and "just" reload those and replace them in our store. Easy. ;|

#### Where To Put Controller Logic or Event Handling

We are currently putting the event handler logic inside of the component/view module, meaning that the code that reacts to user and browser events is alongside the view rendering code and accesses the repository and other services. 

It would be possible to factor this out and to just handle those events in a dedicated place away from the renderer, but it is currently unclear what that would bring us. Perhaps after a few thousand lines of code this will be easier to judge.

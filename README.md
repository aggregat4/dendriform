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

1. Implement breadcrumbs for navigating back
1. First round of prettyfication of the UI (investigate some information hierarchy, ux, similar stuff))
1. Implement navigating to the end and beginning of the tree with CTRL+HOME/END (or whatever the mac equivalent is?)
1. See if we can not reduce the amount of code in tree-component, or if we organize it differently, I don't like that the Tree class contains all of that stuff and the DOM code is still in here as well. Also consider moving the dom code to the exec function at the cost of losing direct access to the DOM elements when I do it locally.
1. BUG: if your select an entire node's text and then press DELETE it will merge the nodes instead of just deleting the selection: need to put a guard in to check whether something is selected
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

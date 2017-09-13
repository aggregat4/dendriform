# Next Steps

1. ~~Make loadTree promise based API in the tree store~~
1. ~~Use the loadTree API to populate the initial tree on the ROOT node~~
1. ~~Make navigation to node with hash parameter work~~
1. ~~Start implementing the store as a pouchdb store so we can do real test with hashchange and editing nodes~~
1. ~~Figure out what a sane standard way is to deal with runtimeexceptions in JS~~
1. ~~Implement changing of node name and persisting the change~~
1. ~~Implement splitting of nodes (ENTER inside node name)~~
1. ~~BUG getting pouchdb Document update conflict when typing fast: should I debounce typing events?~~
1. ~~Try out the Maquette creator answer to how to deal with focus~~
1. ~~BUG: FOUC like effect when splitting? Or is this just focus dancing?~~
1. ~~Implement UP and DOWN arrows to navigate between nodes~~
1. ~~BUG: ArrowDown gets stuck below the root node~~
1. ~~Implement cleverer arrow key handling so we actually try to find the next open node no matter how deep in the hierarhcy (see TODO in keydownhandler)~~
1. ~~We need to handle root nodes differently from other nodes: if root node then just render children (so we don't see and can't split root node), if not root then show name as title and render children below (see workflowy)~~
1. Implement merging of nodes (BACKSPACE on beginning of node name, or DELETE at the end?)
1. Implement deleting nodes when deleting empty node
1. Implement indent and unindent with TAB and SHIFT+TAB
1. Implement undo/redo (command pattern refactoring?)
1. Implement navigating to the end and beginning of the tree with CTRL+HOME/END (or whatever the mac equivalent is?)
1. Implement OPEN and CLOSED nodes
1. Check if it works on iOS, we possibly need to do as suggested in https://stackoverflow.com/a/45954914/1996 (call rendernow to trigger focus)
1. Implement export in some standard format
1. implement import in some standard format

# Future Steps?

1. Typescript?
1. Consider adding unit tests with this approach https://www.npmjs.com/package/mocha-webpack
1. Restart the application without maquette, go pure dom, try to use RE:DOM (https://redom.js.org/)
1. We may need a periodic cleanup process in the background that checks for nodes that have no valid parent, and then gathers them under some sort of lost and found. I have a feeling that there may be cases (especially with sync) where some nodes may get lost


# Software Design

## Flow
On DOM loaded (or hash parameter change to different node), trigger tree store fetch, when promise completes call maquette render function with data objects.

On other events that mutate the tree, send update action to tree store, when promise returns call render.

On navigation events, set the hash value in the URL, call render.

## Architecture

- Maquette for rendering
- Tree store as a promise based api to encapuslate either a local implementation or a pouchdb remote syncing implementation
- The controller layer reacts to DOM and other events, triggers the store actions and makes sure the renderer gets called. Will be interesting to see whether further abstractio here is useful

## Runtime Errors

When a runtime error or exception is ascertained, an Error will be thrown. This is used for defensive programming for example.

## Thoughts

### Incremental Store Loading

The application is moving towards a model where the store is being reloaded completely when something changes, then the virtual dom does some efficient rendering of same. This is probably going to be ok in the short term, since we need to be able to load efficiently initially anyway.

However, optimally we would reduce the need to load things from the database to the bare minimum required. Given that we already load single nodes as individual objects from the pouchdb database, this sets us up for sucess. We "just" need a way to identify what nodes are dirty and "just" reload those and replace them in our store. Easy. ;|

### Where To Put Controller Logic or Event Handling

We are currently putting the event handler logic inside of the component/view module, meaning that the code that reacts to user and browser events is alongside the view rendering code and accesses the repository and other services. 

It would be possible to factor this out and to just handle those events in a dedicated place away from the renderer, but it is currently unclear what that would bring us. Perhaps after a few thousand lines of code this will be easier to judge.

# Project Development

## Development dependencies

See also https://www.keithcirkel.co.uk/how-to-use-npm-as-a-build-tool/

### Standard JS

Using standard JS for linting and style:

`npm install standard --save-dev`
`npm install eslint --save-dev`
`npm install eslint-plugin-import --save-dev`

(apparently it needs eslint to work)

Disable eslint in Visual Studio Code in `.vscode\settings.json`:

```
{
  "javascript.validate.enable" : false,
  "standard.enable": true,
  "eslint.enable": false
}
```

### Babel (still needed like so?)

Babel when required (global install):

`sudo npm install --global babel-cli`

And the necessary Babel profile:

`npm install --save-dev babel-preset-es2015`

### Webpack?

?

### Build Tools

Some tools needed for the various build goals:

`npm install parallelshell --save-dev`
`npm install onchange --save-dev`
`npm install http-server --save-dev`

## Normal Dependencies

- pouchdb-browser
- maquette

## Project Build

Run one of the goals, for example: `npm run build`

## Adding Dependencies

Add as a node package: `npm install <somepackage>`, for dev dependencies add `--save-dev`

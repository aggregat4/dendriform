# Dendriform

An outliner that works offline by default.

CRDT-based peer synchronisation with additional vector clocks for causal sorting and easier garbage collection.

This application is inspired by [Workflowy](http://workflowy.com), the most elegant outliner out there.

## Development

This project uses npm and webpack to build. To get started, do the following:

1. clone the repository
2. perform an `npm install`
3. check out the `package.json` file for the few goals that are provided, for example `npm run watch` will start watching for changes in the files and rebuilds the project if necessary

The sample application can be tested by loading the `dist/index.html` file in your browser.

## Useful links

* [`package.json` specification](https://docs.npmjs.com/files/package.json)

## Next Steps

1. Implement a "completed" toggle for doing tasks
1. Completed State: implement fallback behaviour for the after focus node: if there is no next node, find a previous node
1. Implement all the toggles differently: bit masks? Does that work in JS? At least generically so toggling is always just one parametrized action.
1. Describe the architecture of the client: first high level overview with technologies and abstract components, then real components and dependencies, external APIs, storage format, ...
1. Put all the standard actions into menuitems for the node popup
1. As long as we don't support formatting the importer needs to strip all HTML tags and optionally convert some tags to markdown?
1. make sure that rerendertree is debounced for remote events
1. Implement import by pasting into a text area.
1. Add server side admin UI (minimal, just delete log) and some form of authentication so I can set up a test server. Think about how to add admin UI and authentication to the server without adding it to the open source project. Just add it as a lib? Or perhaps better we just make the server private and keep it closed source.
1. Test with touch
1. Implement multi-select and delete and move operations (at least with keyboard)
1. Escape should dismiss dialogs
1. Redesign the menu: trigger it differently on desktop and have an alternative for mobile

1. MAYBE replace dexie with raw indexeddb calls or something smaller (maybe, maybe not, the size is not that bad)
1. Think through the performance of deleting a root node of a huge subtree: what does that mean for client storage? Do we keep any of those events?
1. Importing OPML first seems to hang in the import dialog before dismissing it, this is probably the DOM update blocking everything, can we avoid that? This is only noticeable for really large imports.
1. At some point we probably need paging for getting server side events, just to prevent us from crashing when the list of events becomes too large. Maybe one parameter suffices? pageSize=100 maybe?
1. RE:DOM is used but not really how it is meant to be be used. For initial rendering it is fine, but since we do our local DOM operations directly by hand, RE:DOM components get out of sync and doing an incremental update when we get updates from other peers does not work. The current workaround is to redo the entire tree when we get such events (see `tree-component.ts` in `update(tree)`). A better solution would be to also have incremental updates there, perhaps with something like incremental-dom?
1. I probably need some kind of forced garbage collect where on a peer a user confirms that this is the master copy and some sort of synchronous operation happens that forces a reset. What does that mean? Generate a snapshot on the server and have clients load this? This means putting data structure knowhow on the server. Or the client generates a snapshot and sends it to the server, but this means that all clients need to have the same software version.
1. Convert remaining promise based code to async functions?
1. We need some sort of versioning support: when the software evolves and it is running "in production" we need a way to gracefully upgrade. Our two external interfaces are the remote events and the local indexeddb storage of events. The local store can theoretically be recreated completely but we need to identify the version change, remote events we could maybe transform?
1. do a real dev/prod build separation as in [](https://webpack.js.org/guides/production/) especially so we can avoid inline sourcemaps when we do a prod build
1. Check if it works on iOS and Android
1. i18n (also consider search, maybe other find mechanism? [regex?](https://stackoverflow.com/a/38151393/1996) )
1. Implement a global inbox capture feature: some shortcut to popup some input box whose contents get added as last child to some dedicated inbox node) (what node though? config? hmm)
1. Override pasting of text to have more control: workflowy does some intelligent things with newlines, etc
1. Accessibility: is that even possible with this tree? How do I make the commands accessible? Do I need a menu per item anyway? How can I make moving a node in the tree accessible?
1. MAYBE Implement a cleanup process that periodically sweeps the tree and collects incorrectly hung nodes in a LOST+FOUND node?
1. MAYBE Implement moving up and down with arrow keys and maintaining approximate character position
1. MAYBE Implement fancier UNDO for text: if I ever want fancier undo like in sublime text (on whitespace boundaries) then I need to actually handle direct keydown events and determine the input events myself because here I can no longer (easily) discern between single character updates and some larger input events like pasting or CTRL+BACKSPACE
1. Make dialog positioning smarter by taking into account how much room we have on all sides.

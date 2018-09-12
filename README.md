# Dendriform

A web based outliner that works offline by default.

This application is heavily inspired by [Workflowy](http://workflowy.com), one of the most elegant outliners out there.

It uses pouchdb for local persistence and renders directly to the dom using RE:DOM as a helper library.

## Useful links

* [`package.json` specification](https://docs.npmjs.com/files/package.json)

## Development

This project uses npm and webpack to build. To get started, do the following:

1. clone the repository
2. perform an `npm install`
3. check out the `package.json` file for the few goals that are provided, for example `npm run watch` will start watching for changes in the files and rebuilds the project if necessary

The sample application can be tested by loading the `dist/index.html` file in your browser.

## Next Steps

1. Implement sync (Hah!)
    1. order for children is not preserved because we just store per node where it is relative to another node and we do not apply this information in the same order we stored it, we need to take into account the vector clocks here
    1. implement server side eventlog in Kotlin
    1. implement remote eventlog
    1. implement eventpump and configure eventpumps
1. do a real dev/prod build separation as in https://webpack.js.org/guides/production/ especially so we can avoid inline sourcemaps when we do a prod build
1. replace UUID peer ids in the event logs with locally resolved ints (persistent)
1. replace dexie with raw indexeddb calls or something smaller (maybe, maybe not, the size is not that bad)
1. I probably need some kind of forced garbage collect where on a peer a user confirms that this is the master copy and some sort of synchronous operation happens that forces a reset. What does that mean? Generate a snapshot on the server and have clients load this? This means putting data structure knowhow on the server. Or the client generates a snapshot and sends it to the server, but this means that all clients need to have the same software version.
1. Fuck, we need API versioning: the above snapshotting makes this clear, but we already need it for differing event structures.... aaargh. Maybe just ignore this for now. We can host new versions on new endpoints (or SOMETHING).
1. Implement suport for hashtags and @-tags (with toggle filter like Workflowy)
1. Implement import of some standard format (probably at least the workflowy opml?)
1. Implement export in some standard format
1. Implement multi-select and delete and move operations (at least with keyboard)
1. Auto link urls in names and notes
1. Extract the event handling code in tree-component in a kind of client side command registry that defines its trigger (event + key) and a description so we can enumerate it for help, find action, make it easier to implement platform specific key combos, etc. Also consider how Visual Studio Code does this:

```json
{ "key": "ctrl+shift+alt+left",      "command": "cursorWordPartStartLeftSelect",
                                       "when": "textInputFocus" },
{ "key": "ctrl+alt+backspace",       "command": "deleteWordPartLeft",
                                       "when": "textInputFocus && !editorReadonly" },
{ "key": "ctrl+shift+alt+backspace", "command": "deleteWordPartRight",
                                       "when": "textInputFocus && !editorReadonly" },
```

1. Check compatibility with Firefox
1. Check if it works on iOS and Android
1. i18n (also consider search, maybe other find mechanism? [regex?](https://stackoverflow.com/a/38151393/1996) )
1. Implement a global inbox capture feature: some shortcut to popup some input box whose contents get added as last child to some dedicated inbox node) (what node though? config? hmm)
1. Override pasting of text to have more control: workflowy does some intelligent things with newlines, etc
1. Accessibility: is that even possible with this tree? How do I make the commands accessible? Do I need a menu per item anyway? How can I make moving a node in the tree accessible?
1. MAYBE BUG? Notes are not expanded when a search hit is found. Not sure this is actually a bug.
1. MAYBE Implement a cleanup process that periodically sweeps the tree and collects incorrectly hung nodes in a LOST+FOUND node?
1. MAYBE Implement moving up and down with arrow keys and maintaining approximate character position
1. MAYBE Implement fancier UNDO for text: if I ever want fancier undo like in sublime text (on whitespace boundaries) then I need to actually handle direct keydown events and determine the input events myself because here I can no longer (easily) discern between single character updates and some larger input events like pasting or CTRL+BACKSPACE

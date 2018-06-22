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

1. Implement import of some standard format (probably at least the workflowy opml?)
1. Try to get it to work with a real couchdb backend and see if sync actually works (2 clients)
1. Implement export in some standard format
1. Implement multi-select and delete and move operations (at least with keyboard)
1. auto link urls in names and notes
1. Extract the event handling code in tree-component in a kind of client side command registry that defines its trigger (event + key) and a description so we can enumerate it for help, find action, make it easier to implement platform specific key combos, etc
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

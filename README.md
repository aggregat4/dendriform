# Next Steps

1. ~~Make loadTree promise based API in the tree store~~
2. ~~Use the loadTree API to populate the initial tree on the ROOT node~~
3. ~~Make navigation to node with hash parameter work~~
4. Start implementing the store as a pouchdb store so we can do real test with hashchange and editing nodes

# Software Design

## Flow
On DOM loaded (or hash parameter change to different node), trigger tree store fetch, when promise completes call maquette render function with data objects.

On other events that mutate the tree, send update action to tree store, when promise returns call render.

On navigation events, set the hash value in the URL, call render.

## Architecture

- Maquette for rendering
- Tree store as a promise based api to encapuslate either a local implementation or a pouchdb remote syncing implementation
- The controller layer reacts to DOM and other events, triggers the store actions and makes sure the renderer gets called. Will be interesting to see whether further abstractio here is useful

# Project Development

## Project Setup

See also https://www.keithcirkel.co.uk/how-to-use-npm-as-a-build-tool/

`npm install standard --save-dev`

Babel when required (global install):

`sudo npm install --global babel-cli`

And the necessary Babel profile:

`npm install --save-dev babel-preset-es2015`

Some tools needed for the various build goals:

`npm install parallelshell`
`npm install onchange`
`npm install http-server`

## Project Build

Run one of the goals, for example: `npm run build`

## Adding Dependencies

Add as a node package: `npm install <somepackage>`, for dev dependencies add `--save-dev`

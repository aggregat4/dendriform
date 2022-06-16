# Journal

## Sometime in 2017

### Promises are tricky

- It is imperative that what is passed to a then() call is actually a function a not just a call to a function that returns a promise. In hindsight this is obvious, but debugging this is nasty.

### Updates need to be serialized

The delayed updates of the rename action (typing a character renames the node) are causing issues: when a rename is debounced and delayed for 250 milliseconds, and you split the same node inside of that window, the node is split and suddenly you have 2 nodes called the same text when the rename finally happens.

We need to debounce to not overload pouchdb, but we can't let the split happen before the rename.

Does this mean we need to serialize updates ourselves? Put all Update commands (without debouncing) in a queue and process that? When do we rerender the tree?

### Virtual DOM Issues

We have a problem with our current model: since we use a virtual dom approach we need to rely on that to reflect changes in our model. Currently the model is always loaded from pouchdb, that is "the truth". This has the disadvantage that (async) updates in pouchdb need to happen before we can render the changes in the state. This in turn causes delays, and even adds a need for debouncing when operations are very quick and pouchdb does not keep up. This makes the application feel unncessarily slow.

There are two ways around this that I see:

- Separate model: Keep the vdom approach and modify an in memory representation of the tree, serialize all updates to pouchdb and have those happen in the background. Problems here are that we need to store _another_ representation of the tree, and we need a way to deal with async updates coming in through pouchdb from other devices: when do we completely reload the local representation?

- Pure DOM approach: Restart the view layer without maquette, go pure dom, try to use [RE:DOM](https://redom.js.org/) perhaps. We could do all local changes directly on the DOM and serialize updates in the background to pouchdb. Here too we need to deal with the background sync issues and how to merge them in.

The two models are more similar then I imagined: they both operate on a local representation of the tree, which in both cases can be partial (think about collapsed nodes) and with both approaches I need to serialize updates to the backing store.

So, current idea: start a new branch where we will implement synchronous commands that operate on the DOM tree and queue all backend repository updates in a serialized queue with pouchdb updates.

Ideas:

- Implement everyhting with getElementById, optionally I could try to optimise to always pass the current node as well since I usually have that, this could obviate a lookup with certain operations.

- A load is a load: always load from backing store and rerender tree. We just need to stop rerendering for everything since we will be (hopefully) in sync

- We should be able to reuse the current pouchdb commands, need to abstract those builders out as an interface and have two implementations?

## 17.1.2018

working on the command executor in tree-api, got a basic idea and classes, need to finish command dispatching, then updating the code in tree-component and then testing, also implement the local store executor!

## 19.1.2018

need to refactor modules (see diagram): introducing a tree manager that handles undo/redo and is the interface implementation to the actual tree component. In addition we make a CachingTreeService that is initialized with another TreeService (e.g. PouchDbTreeService) and then implements the load/initempty/getstore methods in terms of delegating to the underlying service

## 2.2.2018

I have split the Treeservices in 3 layers: Manager -> Caching -> PouchDb.
I have have decided to fully work with client side generated IDs for the nodes (UUIDs) which means that we no longer require information fromm the backing store to generate UNDO commands.
The logic for creating the UDO Command from a command needs to be moved to the payload (from the pouchdb implementation).
This means that undo commands can be generated and managed completely by the manager that also has the undo/redo stacks.
Then it should be possible to do the local implementation in CachingTreeService and then try to wire everything up with
the component. Jezus.

## 14.2.2018

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
(sigh)
It seems like a lot of wrong tracks to find the correct abstraction, but perhaps that's normal?
Also: I am starting to think that our performance problem may not be the storage, but rather just the VDOM rendering, if that is the case I may need to refactor the frontend as well, and that may be nasty and a lot of work, and the local tree storage may have been in vain... At least I had some interesting insights because of the UNDO/REDO work and now that we moved UMDO command creation INTO the commands, it feels much better. But also only possible because of client side ID generation!

## 16.2.2018

Done most of the refactoring, I've arrived back at the frontend and need to fix 2 remaining things in the tree.component:

- Does it have an internal cache of the tree for rerendering purposes? If so, where and how is it managed? Does it get it from the UndoableTreeService?

- I'm a bit flummoxed by the exec() in tree-component and am wondering where the focus information there should be coming from. Perhaps I need to review the master branch to see where this was.

## 23.2.2018

I got everything more or less wired up, all compile errors gone and was testing the new tree. Turns out the inmemory nodes after splitting were not appearing. Turns out our in memory repository was working with ResolvedRepositoryNodes and if we add a new child to a normal RepositoryNode its childrefs were updated, but not the actual list of ResolvedRepositoryNode children. Now I'm refactoring the inmemory repo to use just RepositoryNodes and then construct ResolvedRespositoryNodes at the last possible moment. Basically only when loading the tree. Now of course this will make loading way slower since we need to construct every time and it may turn out this may kill us in the perf department again.
I have a feeling that I will have to move towards direct DOM rendering in the end, keep the state in the dom, as well as in the repos, and then this whole in memory thing will probably have been for naught. Oh well.

## 28.2.2018

Started new branch called direct-dom and trying to redo rendering with RE:DOM. Basic minimal component works, need to load a real tree from Repo and see how we update the component. Two steps:

- update just the one root node first (this involves changing the state as well), then updating the child

- add a List component to the node so we can update children

## 7.3.2018

Removed the local repository cache since there were errors in it, and if we treat the DOM as local storage we may not need it anymore. This will require a bunch of cleanup when we find that the DOM approach works well since there are now a bunch of abstraction layers that may no longer be required.

Also added a queue to tree-service-repository to sequentially process all the async operations on the pouchdb, this appears to be working as I could not reproduce the update conflicts at this time.

Next step is to continue with the event handlers, copy the existing maquette command logic and to implement the associated DOM updates.

Note: Undo operations will require similar DOM work.

## 13.3.2018

Fixed a bug in node splitting and added moving up and down in the tree. Started work on the keydown event handler, next up is implementing the DOM logic for moving nodes up and down the tree.

## 16.3.2018

Implemented most features, big open thing is UNDO. UNDOing the commands to exec is easy, but I need to implement the logic for the UNDO commands in DOM. This may then spark some refactoring since the DOM logic is currently spread over the specific methods.

## 21.3.2018

Implemented UNDO Handling, but did not test it. In this process I factored out the DOM implementation of the various commands, the pattern is of course very similar to all the other places that do something with commands, I need to consider whether and how to extract this further.

There is also an optimization question: currently I directly call the DOM manipulation from the event handlers, but I could just centralize the calls in the exec() function so that this is generically implemented for direct execution, undo exection and redo execution. This is obviously the right thing to do. I am reluctant to do it however because with the direct manipulation I often have the DOM object there and I don't really want to replace that with document.getElementById each time.

Think about that.

Next up is testing undo, and considering refactoring/moving the DOM stuff somewhere.

## 28.3.2018

Tested undo a bit and fixed a bug with splitting nodes. Cleaned up code and removed unused code. Merged direct-dom branch into master.

## 20.4.2018

First round of prettyfication, did some general spacing and sizing stuff, especially reducing the max-width of the tree so it remains readable. Otherwise looked and compared to workflowy and Dynalist for certain aspects. This is ok for now I think.

## 25.4.2018

Design notes for search in Dendriform.

### At load time

- index each node during rendering with LUNR: {name, description, nodeid, [all ancestor ids]}

### At search time

- debounced search term trigger

- search LUNR index with prefix search, retrieve ALL results

- build a map (a node inclusion map):
  nodeid -> {name_highlight_pos: [], desc_highlight_pos: []}

- rerender (no reload!) tree with this map as a filter + highlight as you go

### Status

Source code refactor and cleanup with the DOM stuff, now moved into TreeNode and that class is in its own file. Also the exec function in Tree now takes care of triggering DOM operations if a parameter is passed. This opens the way to trivially (sic) implement REDO at some point.

## 30.4.2018

New idea for search: if we do it with a "real" fulltext index we need to update the index with all changes to the tree.

Alternative: when the query gets updated, reload the current tree and filter the nodes by the query (just substring).

## 4.5.2018

Search/Filter was way more elegant to implement in the same pass where we render the tree, since we descend depth first anyway we can gather status of all child nodes as we backtrack up the tree and decide whether or not a node (and its children) need to be rendered.

Implemented search highlighting (straightforward) and fixed a bug where we needed to take into account whether or not something is selected in the current node before we do something like delete or backspace on it. Turns out the DOM selection API is incredibly crufty.

## 9.5.2018

Started the foundation for open and closed nodes. Persistence is probably transparent. Visually I am currently always showing the open/close control since I would need to use Javascript to show/hide this at the appropriate time and I don't want to do that yet. A pure CSS solution didn't seem feasible.

Actually rendering the open and closed states is not going to be the problem, but we need to make sure that entire behaviour with adding nodes, finding ancestors, etc works correctly.

I changed the DOM structure for nodes by wrapping the actual node content itself in a wrapper element, we may need this for some highlighting or something. This caused me to have to refactor some DOM utilities where we accessed the DOM directly using children properties.

## 11.5.2018

Changing the DOM structure in nodes broke way more things. I fixed a bunch of the hardcoded node children and parent access, but that uncovered even more trouble. Seems to be in a stable state now.

## 18.5.2018

Mostly refactoring of the file and directory structure: splitting out mixed dependencies, making a straight DAG, this looks a bit better.

Still need to finish open/closed nodes by adding in the call to the commandhandler in tree-component onCollapseClick. But that should be trivial now.

## 25.5.2018

Completed opening and closing of nodes with persistence. Note that this implementation still just sets display to none on the client side, it is still an open question whether this scales with large documents.

Implemented most of REDO, had to refactor the undo command handling for that and we now have a more elegant method where only undo commands are tracked in a buffer and a pointer to the current undocommand. This way the redo command is just the inverse of the next undo command.

What's missing is that cursor position is not tracked after a redo event, need to manage before and after positions better.

## 26.5.2018

Redo does not work correctly with splitting and merging nodes. this is due to the fact that we don't have an inverse command for unsplitting or unmerging a node yet. They are also not trivial to implement because they may entail reactivating deleted nodes?

I fixed this by making sure that merging goes into a direction that is symmetrical with splitting: the latter causes a preceding sibling node to be created, in the case of mergin we order the source and the target so that the preceding sibling merges into its next sibling. This way the undo of the one action is the same as the other action.

## 30.5.2018

I feel the urge coming to write my own javascript DOM library, not sure whether to suppress or give in to it. The problem is that the undelete of a node means that at least the parent of that node should be reloaded so we can read that branch to the tree. This in turn means that reacting on the undelete command for the DOM means that we need to load that part of the tree, then trigger the necessary DOM updates.

And there lies the rub: RE:DOM seems to assume that you have a handle on your TreeNode instances, and I don't, at least not for each individual node, and I also don't see it as sensible to reimplement the entire tree as a "proper" RE:DOM thing with nested lists and keys and maybe with that efficient updates.

Either I do that, or I consider taking some of the basic concepts and write a library that doesn't have this "I encapsulate my components in their own classes and objects" approach, but we keep all the state in the DOM and have function that operate on that.

So unimplemented in the domUndeleteNode in DomCommandHandler, and that one implies this whole thing.

Maybe I need to prototype a proper RE:DOM component tree on a separate project with less baggage to see how it works. Do this in JSFiddle.

## 8.6.2018

Implemented a [JSFiddle with an updating RE:DOM tree](http://jsfiddle.net/d1zwfbt6/35/) that seems to work fine. Will now try to port that pattern to the main project.

Refactored the rendering code for TreeNode and Tree to be more canonical RE:DOM and enable the possibilty to update the tree efficiently. I think I have the philosophy of the library now. An additional advantage is that the rendering code only does rendering, it looks much cleaner. Filtering has moved into domain, and is triggered by the places that actually trigger the update of the component.

Also reintroduced Promises as return values from the CommandHandlers because we have our first case of having to rerender the entire tree. The Undelete command requires us to reload and then rerender the tree. In order to the focus position to be correct after this operation, we need to chain the focus handling after the promise of the backend update resolves.

## 13.6.2018

Have implemented the rendering and editing code for the note content of a node. The trickiest bit is dealing with the contenteditable and determining where we are inside it. This will be "intersting" once we add some markups and link highlighting and such.

Not done yet is the persistence of the changes (triggering a command).

## 15.6.2018

Implemented most of the frontend note functionality including copy and paste and dealing with gaining and losing focus via mouse or keyboard. What remains is just to generate the update command at the right time and then to test whether it works. Including undo of course.

## 16.6.2018

Implemented the remaining note functionality with undo and fixing all the event handler special casing we need to do becase the note is a contenteditable where we allow _some_ markup. All of a sudden we are not just in one element, but we may click inside of some markup that is a child of the contenteditable. Working with contenteditable is questionable, but necessary.

Highlighting the notes will be ... annoying. They are not plain text, I need to put more thought and effort into that.

## 20.6.2018

Thinking about search highlighting for notes. Notes already can have some implicit markup (from the contenteditable) and once we highlight search hits they will have explicit markup. Additionally we want to at some point support some minimal markup in node content (names and notes), I think. This means that we need to be able to strip out spurious (accidental) markup when saving note content but retain the required markup.

A [thirdparty library](https://github.com/gbirke/Sanitize.js) existed that seems to do exactly this sanitization. Saves some time and it is very straightforward and small.

Now we have the highlighting question. Until now we have combined the searching for hits and the identification of highlights in one pass during the instantiation of the FilteredRepositoryNode. Then when we render the node name or note we assume its content is just text and generate a DOM fragment that is a combination of textNodes and highlighted spans.

We have 2 ways to change this up. Either I just check for _a_ hit when filtering the content and don't actually look for the highlights and calculate the concrete highlights inside of the textNodes after converting the content to a DOM fragment. Or I continue as we do now and assume that search strings do not contain angle brackets (means search string must be sanitized), generate all the highlights, then mark up the node content as a string by inserting HTML strings and finally converting all that to a dom fragment with innerHTML.

On reflection the latter approach has the problem that I may find hits inside tags and highlighting that would invalidate the html. The robust approach it is then.

## 3.8.2018

Hit another roadblock: when implementing the eventlog based repository I needed to support updates to the tree. This include not just the reparenting but also the position of the node in the list of its children. Sadly we have no way to represent this ordering anywhere.

This came up when refactoring RelativeLinearPosition to only care about AFTER positions and not BEFORE. This is in itself probably hard/senseless because we need BEFORE for the split operation (see tree-service).

But first we need to solve the ordering question: how and where do we track it? Is this another CRDT? Another Eventlog where the node concerned is the parent node and the events represent the sequence operations on its children? Is this an LSEQ? Logoot? (<https://hal.inria.fr/inria-00432368/document>)

We probably need another custom approach here, a separate eventlog, queryable by parent node id, containing events of the nature insert(nodeid, afternodeid). We need a similar strategy to resolve concurrent updates (same afternodeid) by sorting by peerid. Can we have events that have the same afternodeid from the same peer that are concurrent? No, since we always increase the vector clock.

## 10.8.2018

Yes, we do need to track child ordering, but I'm going to try to cover it directly inside the ReparentNodeEventPaylod. That seems more robust (no diverging updates?). On the other hand if the order just changes within the existing parent maybe this is redundant?

Implemented the caches for the parent child structure, and the subscriptions on the event log to react to new (remote) events. This made clear that we may have another inefficiency: when remote updates come in we need to update the parent/child caches. Since we don't really know whether these updates affect the current state (were they executed before or after our events?) we would really have to get all the relevant node events, sort them and only apply the final state.

Instead the current naive implementation just debounces the rebuild function and recreates the complete cache with every (external) event.

## 15.8.2018

The implementation of the local event log and the associated repository is "done", but without any synchronisation to remote logs. Now we need to try to run it and find all the bugs and performance problems. Oi vey.

## 5.9.2018

Strange error with:

`__WEBPACK_IMPORTED_MODULE_1_dexie__.Dexie is not a constructor`

turns out to be related to the way I import the Dexie module!? There is a difference between `import Dexie from 'dexie'` and `import {Dexie} from 'dexie'`?

Weird. Solution from <https://github.com/dfahlander/Dexie.js/issues/658>.

Dexie, or rather IndexedDB, does not like it when a table is defined without a primary key. I had to make sure the peer table has one or I would get strange `Error: Failed to execute 'put' on 'IDBObjectStore': The object store uses out-of-line keys and has no key generator and the key parameter` errors.

My build is a bit fucked, watch no longer watches src/\*.

In our eventlog our counter is apparently not stored (undefined). Is the problem that it is 0? Google Dexie for that.

## 7.9.2018

Turns out `watch` now requires directories as parameters not glob patterns. That fixed the watch.

We are able to edit a tree and it is sort of persisted! Yay!

Sadly our child ordering is fucked. The current approach is to store in each tree event after what node a certain node comes in the order. This breaks down of course when we insert new nodes that come after node A and another node B was already after A. When reloading the tree events to construct the tree, it is more or less random what node comes first there. We probably have to fundamentally change how we store order. I don't know how yet.

Oh and at some point I definitely need to optimize peerId storage, it is rediculous storing the UUIDs in each event.

## 14.9.2018

I had an idea for a solution for the child ordering problem: I could just keep nodes that move to another parent around in the original parent as a kind of tombstone. This would mean that the "afterNodeId" property of normal nodes is always correct since no node disappears from the child list. I could then just ignore those "deleted" nodes from when constructing the child list.

The problem is that those tombstones would also have to exist when just moving a node around inside one parent's child list. It then no longer becomes ineffecient but also untenable.

Do I have to do something like Logoot after all?

Apparently the answer is yes.

The [original LOGOOT paper](https://hal.inria.fr/inria-00432368/document) is more or less readably, I just had some trouble grasping the identifiers. This was a bit more practically explained in a [JavaScript logoot implementation](https://github.com/usecanvas/logoot-js).

This means that we need a new eventlog that is also (like the others) segmented by treenodeid, the node reference is the parent node. For each node the sum of its events represents a logoot list of its children.

In the eventlog we store events with the payload (op, pos, nodeId): 'op' signifies whether this is an INSERT or DELETE operation, 'pos' is the logoot identifier denoting its position in the list and 'nodeId' is the child node in the list.

Similar as to the other event logs we can garbage collect at insertion to only retain the last event. When converting these events into an array we can then remove deleted nodes.

Since logoot identifiers contain the peer vector clock for uniqueness (not ordering) I'm not sure our current abstraction can deal with that well. It may also be sensible to put the actual logoot implementation in a separate class.

Note: as I look at the logoot implementation linked above it seems to me that the vector clock that is mentioned as a necessary part of identifying a sequence item is not actually a full vector clock but rather a logical clock value for the particular site that inserted the item in the sequence so that together with the site identifier it makes the item unique.

## 21.9.2018

The initial Logoot child ordering implementation is "done" but untested. There is a too much code in repository-eventlog, I need to figure out how to refactor that.

## 26.9.2018

Having now debugged some implementation issues with the logoot based child ordering, I now notice that the general garbage collection policy used in the local event log implementation is wrong for the logoot events.

Until now only the "last" (by vectorclock and peerId) event for a treenodeid was kept. Since for the logout sequence we have delete and insert events, and we need to retain all events for unique children we need a better policy here.

Would it suffice to enhance the eventlog api to take some sort of discriminator that says: consider the following fields as keys to segment the log? By deault it is treenodeid, but in the logoot case it needs to be treenodeid, childid and the operation type. That may be elegant and enough?

## 28.9.2018

I have the impression the logoot sequence is not working correctly, somehow it seems to contain wrong (and too many?) values for the positions. Need to debug this. Unit test?

## 3.10.2018 Javascript tooling is crazy

Had to dick around with my babel, webpack, jest and other configs to make jest work with Typescript files that import ES6 Javascript stuff from JS files. See the commit history. This is crazy.

A really specific hint I want to mention: even if you already have `"@babel/core": "^7.1.2"` as a dependency, you still need `"babel-core": "^7.0.0-bridge.0"` as an additional dependency to make jest work with ES6 dependencies correctly.

## 5.10.2018 Considering the server side

Considering the server side eventlog we need for coordination between peers. The server should be as agnostic as possible and only concern itself with the technical necessities: managing users and eventlogs. It should be agnostic to the type of event.

The client side question then becomes: do we have 3 server-side eventlogs for all three types of event or just one? This comes down to having a single remote eventlog proxy or three separate ones. The single implementation then needs to be able to deal with all three event types and dispatch to the correct local eventlog.

Currently tending towards one server side log and therefore the dispatching local implementation. Makes one think that perhaps we should also consolidate the three local eventlogs? On the other hand that makes debugging harder and makes it all a bit less clear.

Maybe there's a nice way to easily dispatch these different event types back and forth.

## 10.10.2018 Server Side ReST API

Implemented a tiny ReST API prototype that works and solves some niggling issues with Kotlin and JSON serialization.

It became clear that we can try implementing the server so that it is totally agnostic to what an event is, it just stores strings.

Looked at some Kotlin options for database access and was not really convinced yet. Want to try using HikariCP as a connection pool and then doing my own tiny tiny wrappers around JDBC. I do want to include schema versioning and autoupgrading the schema with migrations as well as being very careful about detecting issues with the existing schema.

For now we need just one table for the events, but we will need some more for all the user and eventlog stuff. I need to think about how to approach authentication here.

Do I want to model users in the API? This is the age old problem. But probably not since eventlogs are not a subresource of a user. Right? Let's not and treat user auth out of band somehow. I will, however need to model authorization: who has the right to access what logs. I will also need to create eventlogs on demand if the ID is not known yet.

Do I map external eventlogids (which are strings) to internal ids?

## 26.10.2018

Started the client side implementation of talking to our new dendriform-server to get events from other peers and ran into a design issue. The event pump on the client side needs the local max event counter and the server side max event counter so it can always query for the right new events in either direction. This seems a bit fragile at the moment since we should be able to just deal with whatever events come (see vector clocks) but on the other hand we need an optimisation like this for performance so it seems reasonable to set this as a prerequisite.

Two design constraints (or assumptions) for the design:

- A peer always knows all of his own events. This means that if a peer's storage is ever reset, it needs to act like a new peer and start from scratch.

- A peer always has a consistent state regarding the events from other peers he already saw from the server. Concreteley this means that we always have a valid counter from the server reflecting the current state of events that we have read. Again, if we reset the client somehow, we just become a new peer and fetch all of the events.

Can we implement the client side event pump with pure polling or do we need Server Sent Events or something? polling won't be really immediate and maybe too much load? Is SSE too complicated? Do some digging.

## 16.11.2018

SSE or Websockets would require the server to implement some event bus that keeps track of new events so that it can notify any subscribers. This seems like a more complicated design for a later stage. Let's go with polling for now.

A skeleton for the event pump now exists: it still needs implementations for the local and the remote pump and some wrappers that do the actual scheduling of the calls and starts or stops pumping when requested.

## 21.11.2018

Implemented the client side pumping of events from the local to the remote store and vice versa. Implemented a pumping class that continuously executes a function with a delay and some notion of backoff in case of failure.

Realized that the current subscription mechanism for events is a bit wonky: it is only used by the local event log to invalidate the tree structure cache when new events come in. This subscriber is not interested in the contents. Do we need this in this form? At least it does want to know when certain events have arrived...

Stubbed out a class that should implement the HTTP connection to the server, this needs to be implemented using fetch.

## 28.11.2018

Implemented most of the getting events from the server in the RemoteEventlog. The extremely tedious bit is the serialization and deserialization of all the objects we can transport, especially event payloads.

I have a bunch of deserialization logic written in serialization.ts, but it needs completion and especially unit testing before I start debugging fetches to and from the server with strange errors.

## 5.12.2018

Next step: Instantiate and wire event pumps in tree.ts.

## 14.12.2018

Backoff was not implemented correctly: had to add a max backoff delay so we don't get super slow and we needed separate pumps for the local events and the remote events. This makes EventPump have 2 almost identical paths in it which I don't really like. May be nicer to solve this generically, have the drainLocalEvents and drainRemoteEvents functions handed in, but then the storage also needs to be generic.

We should now probably change the tree such that when the server has less data than we (lower counter), we reset the local tree and take the server's word for it. In the future we should probably snapshot the tree client side and store it somewhere in localstorage as a backup?

When considering the current architecture it seems like a mistake to have 3 eventlogs locally and remotely for each event type. I realised this as I considered how to handle the case where the server has no events and I need to reset the local state. It is much easier, more efficient and consistent to just have the one eventlog synced to the server.

This change has some far reaching consequences: I need to start by refactoring all the types in eventlog.ts to no longer have the generic T type, and I would change DEvent to have a payload that is a union type of our concrete three event payloads.

Further the DEventLog interface needs to have the eventType added as a discriminating parameter on the get methods (getEventsSince and getEventsForNode). Finally in our storage implementation of eventlog-local we need to have a composite (or multiple composite) key for eventtype+treenodeid or maybe also eventtype+eventid so we can query for specific kinds of events in our repository implementation.

## 21.12.2018

The eventlog was refactored to store all events, independent of type. This makes management easier, but in the process of refactoring we did some async await refactoring as well and we have a problem now. Possibly in repository-eventlog in loadTreeNodeRecursively.

## 9.1.2019

Fixed two bugs. One was introduced with merging the eventlogs to one: I was not querying the eventlog by nodeid AND by type when collecting events to garbage collect, which led to deleting events that should not be deleted. The other was older and related to moving nodes in the tree to the top position being impossible.

Next steps are to test the eventlog implementation a bit more to make sure it really works for the single user use case and then to test it from multiple clients.

I just did a quick test with firefox as a second client and it does eventually show all the nodes that exist on the server, but it does that only after a refresh. Before that it creates a new document and after the second refresh it merges the trees and we have a spurious empty node. Is this at all solvable? Should we load the tree and wait a bit until we at least tried to get to the server? Merging the one empty node is not that bad, it is in fact desired behaviour from a certain point of view. But some tiny best effort in the beginning to try to get to a server may be useful. On the other hand that will impact performance. Perhaps the better solution is to not create an empty node by default?

BTW we also need a way to notify the user of new server side events and the need to refresh the tree. Refresh it automatically? Is that too disruptive? Just notify on the page? I think workflowy forces the refresh?

BTW2 merge this branch back into master.

## 16.1.2019

`npm audit` would not run because of a POST request failing with a 400 against the registry. Solved by deleting the node_modules directory and the package-lock.json file and rerunning `npm i` and `npm audit`.

Going to ignore the empty workfloy concurrent edit thing since that only happens in the beginning, need to fix this a bit in the future but want to focus on updating a tree with remote changes.

Design idea for automatic updates when remote changes are detected:

- The client subscribes to the repository for events concerning nodes that are children of the current root node. This should be fast since we have an in memory map of the tree. This subscription must be remade every time the client loads a different root node.
- When a change was detected, the client rerenders the subtree of each node that was involved, a best effort is made to restore cursor position.

Maybe experiment with just updating the root node and see if that is sufficient?

I've also started a prototype for a keyboard shortcut registry. So far I have an abstraction to represent a shortcut. The question remaining is where to implement the shortcuts and where to register them.

In the place where we have a Tree component instance? Call some utility "registerStandardKeyboardShortcuts" function that then just registers all our default handlers?

## 19.1.2019

Added subcription to change notifications in the repository interface and eventlog implementation. Added functionality to the tree to subscribe to that and to reload the tree on changes.

First simple tests with an incognito window and a normal window show that changes are synced, the trees are updated and they seem to converge on the same state!

Testing was not thorough and will need to be more extensive. I saw one case where during parallel updates (changes on one tree, switch to other and make changes there) caused a "can not deal with more than one event per node" exception in one of the trees. The good news is that it fixed itself afterwards. This could be a race condition in the eventlog or perhaps more likely just a normal situation when updates come in from two sides and garbage collection has not run yet?

## 25.1.2019

I have a somewhat unsatisfactory way in tree.ts to wait for an initial server pull before actually loading and mounting the tree. This still feels too slow on initial load, but it prevents the spurious empty nodes.

However, with concurrent updates I have observed both the "more than one node" error as well as a REDOM issue where in the `TreeNode.update` function when updating the `childList` function it tries to remove a grandchild from a child of ROOT and it actually tries to remove the grandchild from ROOT directly and this fails. I don't understand yet what is going on there.

## 30.1.2019

Made the code more robust in several ways.

We can now deal with multiple node structure events in getEventsForNode (now getNodeEvents) in eventlog-local. We basically perform an ad hoc garbage collection if we receive more than one node event from the db. This can theoretically happen because all the DB operations are async and someone may request a node that is currently being updated.

In addition I fixed a potential race condition where when inserting nodes in the local database, we were tracking what the current highest eventid is as the local maxCounter but where due to concurrent updates to the database we might have saved a wrong counter (not the highest one but just the last one that was done updating). We actually observed this behaviour in testing. Impossible to prove that it is now gone of course. In addition I added some logging and some extra code to recover from this should it still occur by always checking when getting events whether our counter is really the latest one.

Finally I investigated the REDOM error where it was trying to update the childlist of the root node and was running into errors because it was trying to update a GRANDCHILD instead of a direct child. I figured out that is due to the fact that when you indent a direct child of the root, this change is made directly in the DOM and not with redom, therefore the redom tree structure is out of sync with the real DOM. This is a problem. I will probably have to redo a lot of the dom handling stuff. I actually did it directly in DOM since I didn't see a way to get from a DOM node to a REDOM object and have it do the update. Must investigate further.

The only ways I currently see are:

- Do it the REDOM way as I understand it: this means that an change event on the dom results in a change in the complete tree and then I just trigger a tree.update. The problem with that is that I would need to reconstruct the entire tree every time a change happens or I need to keep the tree around. And then I am almost in the same place I was with maquette, right?

- Remove REDOM entirely and do the renders and node updates based on remote events completely myself.

Is there some middle way? Could I somehow get to the REDOM component from some random DOM node and trigger a local update? I don't even have the information for a local update.

Local events are not the problem, basically remote updates are what kills me. If I go DOM only, do I react specifically to the three possible remote events? But they have a different granularity as the local events! Bollocks.

Here is an idea: in `tree-component.ts` in `update()` I currently check whether we already have content, and if so it just calls update on that redom component. If not (at primary load for example) I just instantiate a new empty TreeNode and then let REDOM do its thing. I could just always do a new TreeNode() at update so it would completely rerender. I would probably lose efficient updates since I assume that REDOM can not diff its components against some existing DOM.
This would then be the part that I could replace at some point in the future with my own thing.

Another thought: replace the REDOM code with something using [incremental DOM](https://github.com/google/incremental-dom).

## 1.2.2019

Postponing the previous issue, just rerendering the tree entirely at this point and documented the alternative solution with incremental-dom.

I have a keyboard event trigger and keyboard event action abstraction, I just need to implement the matching function for the trigger and register the keyboard shortcuts and then see how I deal with the tree specific operations in the tree.

## 6.2.2019

Stalled on the keyboard event stuff while defining some interfaces that the various actions would require to interact with the tree because I observed some bugs in our node moving. When moving a node over a child and then across that child to a different parent, then a duplicate node would appear on the original parent when reloading the tree. This was due to the reparenting logic in the repository-eventlog not actually deleting the moved node from the sequence of the original parent when moving it down.

Fixed a further bug where moving in the same parent was causing the position to be wrong, we were not calculating our logoot offsets correctly.

## 15.2.2019

Over the weekend I moved all the keyboard triggered actions out of `tree-component.ts` in to `tree-actions.ts` where they now have declarative and sometimes semantic triggers which should improve cross platform compatibility and reduce maintenance efforts.

Still not quite entirely happy with the system: registering the trigger is extremely verbose, we could benefit from a mini syntax to define the triggers and the individual handlers need too many dependencies. Many of them don't need all the tree bits and command handlers. Not sure if that is a problem or not.

Did mostly bugfixing and completing the keyboard trigger work. Started investigating OPML import with some test data from Workflowy and Dynalist and checking out how to handle file uploads client-side. Additionally investigating ways to trigger and show a menu for these kinds of actions since we need a way to do that. Alternatively I could bind import to a shortcut and workaround it like that. Not sure what to pursue first.

## 20.2.2019

Implemented a rough sketch of a menu component using Custom Elements, some CSS and triggering and cleanup logic in tree-component. This seems to fundamentally work.

Needs a broader dismiss trigger that reacts to clicks anywhere in the document as well.

Needs an approach to add menu items there that can call the appropriate actions (in tree-actions.ts?).

## 22.2.2019

Tweaked the menu a ton and had some thoughts about responsive design and our controls. Menu popup is now in a place where we can fill it with stuff.

## 27.2.2019

Refactored the actions stuff to pull out an action registry from the tree, and to avoid cyclic dependencies between the actions and the tree component.

Added a new tool called `madge` to generate module dependency graphs with `madge --extension ts,js src -i /tmp/deps.png`.

Currently struggling to get the tree node menu items to actually get instantiated. I though it may have been me not actually calling document.createElement, but it still does not work. For some reason connectCallback is not called. I should refactor this back to an action Object and pass the dependencies through the constructor once I know what is up.

## 1.3.2019

I fixed the menuItem component, it was not being shown because I had a typo: instead of `connectedCallback` I had `connectCallback`. :facepalm:

The custom elements can also just be used as classes and nicely instantiated, so that's much better.

Next challenge: actions need to act on the correct node, this means that at activation time they need to be able to identify the current node in focus. My current thought is to just generalize the `getNodeForNameElement` code that almost all actions use to something like find the closest ancestor that is a node. This would basically assume that we are somehow inside the the node dom tree. I think this makes sense.

## 6.3.2019

Generalised the `getNodeForNameElement` code and introduced css custom properties for some reusable values.

I need a dialog component. After implementing the menu, my first actual menu action is to trigger an OPML import dialog. This again is a dialog like the popup menu and I don't want to custom implement the logic each time. I need some way to reuse the trigger/hiding/etc logic.

What I can't do is make the dialog a stateful component since I may have thousands of potential menus in the tree.

Show:

- IF click on trigger element AND dialog not already shown AND not same trigger
- THEN put dialog in right location of dom tree (needed?), make dialog visible, set aria-expanded on trigger

- IF click on document AND dialog is showing AND not clicked on trigger AND (did not click in dialog OR clicked close button)
- THEN dismiss menu: aria-expanded = false, display = none

So a dialog manager needs access to a trigger element and a dialog element, that should suffice.

A dialog manager can have a dialog registered on a concrete element or on a css class.

Started implementation of a dialog manager.

## 8.3.2019

Implemented a dialog system that works quite well. This now pulls all the specific logic out of the tree-component. This also means we are now fixed positioning the dialogs (since we can't "know" about the local DOM structure anymore) but that seems fine. Positioning the dialog should definitely be smarter for constrained screen sizes but we'll tackle that some other time.

Started the OPML import menu, need to debug the transient popup dialog showing.

## 9.3.2019

Transient dialogs work, keeping dialog elements in body works better. Now to implement the OPML import itself.

## 13.3.2019

OPML action is more or less implemented, but untested and there is no error handling.

I introduced a new Command for this: CreateChildNode, that creates a node, makes it a child of the given parent and hangs it at the end of the child list. This seemed like the better solution than to artificially split the current parent node, reparent the new node and then modify that node. This keeps the number of events down and makes this more efficient in general.

## 20.3.2019

First successfull import of OPML. Now the interaction needs to be better:

- validation output for the import
- need a separate import button
- the file selection can not stay persistent after import (reset values after import)
- test dynalist OPML
- test large OPML

## 24.3.2019

Made the opml import dialog more useful, still missing validation messages.

Tested import of opml files with larger sets of data, including more thatn 10 000 nodes of my work workflowy. Got the client side rendering fixed to allow for very quick insertion. The insertion into the eventlog now also finishes, but takes long time. Client side is crazy fast.

Remove some console.debugs from inner storage loops, but I think we need to start optimising storage. At the very least get the UUIDs out of there.

Inserting individual events and directly garbage collecting them is also nasty. What can we optimise?

At the very least we need something that watchs the event queue and prevents closing the window as long as it is not empty.

## 28.3.2019

Implemented an activity spinner that observes the queue of repository commands and spins when it is active. Styled it and did some tiny preliminary mobile styling. But there is a bunch left to do there.

## 30.3.2019

I optimised storage of the events by converting UUIDs to numbers, but it did not get any faster to persist the work workflowy import. From the performance profile it seems like the storage is being done only every 10ms or so. I am guessing that maybe the queue that I'm using is responsible since it uses setInterval with a 0 timeout for popping things off the queue.

I replaces the queueing with just executing the action directly, but now the events don't seem to get stored anymore? Strange.

## 31.3.2019

The eventlog has been optimised by replacing all incoming external peerIds with integers. So instead of a UUID we just store 0, 1 etc. This requires a mapping table that is persisted in indexeddb but will always remain small.

Struggled with the performance of the eventlog storage and it was unclear where the performance limits came from. I was observing single event storage with 10ms to 15ms pauses.

It turns out this was just the individual indexeddb stores. I implemented batching for the stores in the repository: now we store events when either a certain latency in ms is reached (we don't want to wait too long to store stuff so we can be sure to actually have it on reload) or when the queue has a certain minimum size.

After tweaking the numbers a bit we now have phenomenal indexeddb throughput. Mere seconds to store all the events.

Doing this async storage required another feature so the initial empty tree can be created, loaded and displayed. Changes to the repository can now be requested synchronously which will drain the queue immediately and wait for the result. So far this is only needed for the initial create and render.

The pqueue from the command-handler-tree-service can now also be removed since the storage layer does the queueing.

We now need a new approach for (async) garbage collection. When and how to execute it?

Here's how we're going to do that:

- keep a list of gc candidates, these are just the nodeids+eventtypes of the events that came in during storage

- have a separate setTimeout method that regularly looks at the list, pops off a batch of N ids and performs the garbage collection on them

- at the start of the program prefill this list with the ids of all events where more than one event exists for nodeid+eventtype

## 31.3.2019 B

Garbage collection now happens in the background and is semi-optimised.

Now determined that search is slow as fuck when operating on a large dataset. I need to somehow determine what it is that is the slowest here. If the loading is slowest, which I suspect, then I don't know what we can do...

## 3.4.2019

Optimised tree loading by introducing an alternate path that triggers from a certain amount of nodes that need to be loaded. It will load all node events from indexeddb and then create the tree by traversing the parentChildMap and getting nodes from that list.

This speeds up full tree loading significantly, but for the 8000 work nodes this still means a little less than 2 seconds of loading the node events and 2 seconds rendering the entire thing.

There are two further optimisations I can do:

- Have a composite index with node events so I can filter by type (I only need a third of the 24000 events).
- Have a clever approach where collapsed nodes are not actually rendered but we "just" store the child tree on that node and render it on demand when the node is opened. This would massively cut down on rendering trees that are not fully opened, which in reality is almost all of them.

## 3.4.2019 B

Implemented composite index on dexie for the loading all event types use case and loading performance has been increased. It takes about half or less the time from before.

Next up: on demand rendering of child nodes.
Next up: the event pump even when not able to reach the server is causing massive queries on the indexeddb locally since it tries to sync all the local events. Turn this off more intelligently?

## 5.4.2019

I implemented some half hearted async loading of children of collapsed nodes, but I'm getting confused with the order of things. It seems like the OpenNode command gets executed but the change to the collapsed state does not reach the eventlog before I start loading from it? Is there some place where the promise is lost somehow? Trace further with breakpoints in the eventlog publish call

## 6.4.2019

On demand loading of nodes when opening collapsed ones has been implemented. This required pulling the notion of synchronous updates up to the command creation. This way we can require a particular update (say the opening of a node) to be synchronous so that we can immediately load its children and we are sure that the node will be in the correct collapsed state.

This synchronous flag does not look nice in all the method calls though, but I'm not sure how to make that better.

I think we are very close to optimal performance now but it is still unclear what strategy we should use to load the nodes themselves: do we stay with the heuristic that chooses bulk loading or incremental loading like we have now? To what values should we tweak the threshold?

## 12.4.2019

Starting to add auto hyperlinking for tags and links. Problem I am having is that links inside contentEditables are not clickable. Dynalist just solves this by only allowing clicking when not in the node (requires setting contenteditable to false on blur) but workflowy has some dark magic that always allows clicking.

I really want the latter. Especially since I would need it for notes anyway.

Is there some trick whereby I set the link to contenteditable false when mousedown is pressed?

## 13.4.2019

Implemented on the fly autolinking of URLs.

This was not trivial since we have to consider many aspects:

- We now no longer need highlight filter matches, but also URLs and soon tags and @ mentions. This meant generalising the markup code.
- In a contenteditable links are not clickable so we needed our own click handler and open the links like that.
- We want links to be autolinked when start typing them in notes and in names. This required us to perform the rename operations WITH dom and then to implement new logic that for each input checks whether in the new text something should be marked up or marked down, and if so it will replace the contents of the node AND preserve the cursor position.
- Since we now definitely have tags in our nodes our cursor posiotion code was no longer sufficient. We needed to be inspired by the Stackoverflow canonical position answer to get and set cursor position _across_ tags.

With an improved pipeline for updating names and notes we should now be better prepared for further markup extensions to the program.

## 14.4.2019

Implemented autolinking of hashtags and at mentions using the mechanism from yesterday with the small extension that we needed support for lookbehind in the regex matching, and this is not widely supported yet. Faked it with some subgroup matching.

Clicking a hashtag or at mention now causes the tree to be filtered.

Identified a shortcoming in the filtering in that it will treat the entire filter string as the query and what we want is to tokenize the string and treat it as an AND between its constituents.

For example: clicking two hashtags after another should filter down to those nodes that contain both the first and the second one irrespective of ordering.

Also implemented clearing the filter when pressing escape anywhere. This necessitated a document eventlistener.

## 14.4.2019 b

An interesting effect of having deferred node loading is that much more of the pipeline of DOM operations for creating and updating nodes is now async as well. This means that we need to take care to await all the necessary operations if we depend in one operation on the DOM result of a previous operation.

For example we just had a bug that only the toplevel nodes of an imported tree were visible. After a refresh, the rest was visible as well. This was due to the fact that each node operation in the DOM was async, and by the time we were adding child elements, the parent was not yet added to the dom so it was just not shown in the tree.

## 16.4.2019

Added rudimentary markup for bold and italic by just using markdown and our existing autolinking infrastructure. This is just temporary, in the longer term we need something with only one pass and with the ability to nest markup at least.

I figured out the bug with where adding nodes, reordering them and then reloading causes the order to be wrong. This is because in `repository-eventlog.ts` in reparentNode() we explicitly depend on the fact that when we reorder inside the same parent, garbage collection will make sure that the duplicate INSERT operation in the logoot sequence (the original one and the new one) will be compacted and that only one will remain. Since garbage collection now runs async, this is no longer always true. If you reload before gc, then you will have two insert events. This gets worse the more reorders you have of course.

If we would force this operation to be synchronous, performance of reordering would deteriorate significantly. Alternatively we could store DELETE operations in the logoot sequence, but that does not seem to be implemented yet in our logoot lib and it would mean a new kind of eventlog event?

Final alternative: implement a dedicated garbage collection just for a parent's logoot sequence events that we trigger synchronously?

## 24.4.2019

It is always good to step back from a problem for a bit. On looking at the logoot sequence problem again I realised I had already accommodated for insert as well as delete events. Since I was specifically suppressing the delete events when the parent node wasn't changed in a reorder event, I could just remove this special casing and it all works.

The downside is that additional events are generated for all moves that remain in the eventlog as tombstones. Garbarge collection should be able to get rid of them, need to verify that we remove them.

Changed some behaviour to always open the first node of a page, regardless of its collapsed state. Otherwise you could never see the children of a collapsed root node.

Changed the implementation of our verifyAndRepairMarkup function to always just redo the entire markup as soon as there is **any** markup availably. This makes for really nice markup updates when you are editing links for example. No matter where you add to it, it is automatically linked correctly. The downside is that we redo the entire markup on each edit in a text node that has any markup at all. For large amounts of text this may be slow. The bet here is that node contents will never be so large that it matters.

Undo was also no longer working: had to modify the verifyAndRepairMarkup function again. In case of node name or note renames we were not actually using the new text to update the dom node. So this had to be extended. The condition for NOT doing anything in this function is also different since Undo can cause text to be added or subtracted without impacting the markup. Now the condition for not doing anything is that the text is completely the same as before **and** we have no markup at all.

## 8.5.2019

I refactored `eventlog-local.ts` to split some self-contained code out into some helper classes. I think this makes things more legible.

Also refactored enums into const enums, based on a tip in a chat on a twitch livestream linking to an article. Apparently they are not compiled to objects but inlined to values.

For now I don't see an obvious refactoring for `repository-eventlog.ts` and will leave it as such.

Started work on the opml export action.

## 15.5.2019

While working on the opml export action I was sucked into a tooling and dependencies upgrade blitz. We are now up to date again, unused dependency p-queue is now gone, we depend on the proper npm hyperscript dependency and I futzed around with some Typescript webpack loader whatever bullshit.

Finished OPML export implementation with file download.

Started a new branch to implement adding `created` and `updated` timestamps to the nodes. Interesting to see what I have to change to make this change.

In order to have ISO 8601 timestamps that include the actual local timezone I had to add momentjs as a dependency and use its format function to generate that. May be a bit overkill if I use it just for that function?

## 17.5.2019

Implementing created and updated timestamps was easier than expected on the backend. It appears that the datamodel with node contents is sufficiently abstracted and deduplicated. We basically just have the two representations: RepositoryNode for the frontend and the event payload for the backend. It seems right to keep those separated as an anti-corruption layer even if it duplicates a little bit.

Moment js seems to work really well so far for generating ISO strings and formatting dates. The cost doesn't seem to onerous.

I take it back: momentjs adds 540 KB to the appsize!? Need to investigate whether I can get the same features with less of a performance hit.

I went to luxon instead of moment js: huge reduction in size, it's only 250 KB or so. Still not tiny, but much better. And it delegates to new browser Intl features which is good.

I learned something new with the webpack/typescript setup: last time we refactored a bunch of that to be apparently better or more standard. I still have the problem that I need to manually add paths to node_modules libraries that I use in my code. Today I noticed that for luxon this was not required. The trick appears to be that when you install the @types for a particular dependency it also finds the module itself.

So I need to add types for all the libs that have them.

Also: apparently I needed to set `moduleResolution` to `node` in tsconfig to make sure it finds node modules. :facepalm:

Update: the REDOM type definition seems to be faulty, it does not correctly allow for a lambda as a parameter to the list function, therefore had to revert to removing the types, specifying its path in tsconfig and not use typed access. At least I was able to solve some minor type issues when I had it active.

I also realized that the "created" timestamp may not be that useful: when splitting a node it can non-intuitive what part of the split node gets the original created date...

## 22.5.2019

Improved the UX for small screens by moving the collapse button to the right of the screen when crossing the width threshold and removing the menu button. This allows the content to sit flush with the left hand border of the screen.

This also necessitated making the toggle button only appear when a node really has children. A state that needs to be updated as soon as a node gets new children. This makes the mobile UI much more usable and cleaner.

This is all heavily inspired by Workflowy, I am a bit worried that I'm so close to workflowy UI, but they did solve it really well.

I will need to do something about the menu as well: that is now floating strangely to the left on nodes without children. Workflow also does it well here by showing the menu on hover over the bullet or as a dedicated menu on mobile devices.

Dynalist is currently down and I can't check how they solve that.

## 24.05.2019

Implementing completed/uncompleted status on nodes. The backend work should be done, there is a new TreeConfig class used on the tree component to track what sort of toggles are set. This is different from transient state since this is somewhat persistent.

GUI is required for configuring the current mode, the shortcut for completing/uncompleting is missing. We also will need some css to show completed nodes with strikethrough or something similar.

I now have 3 commands that just update flags on nodes (deleted, collapsed and completed) and this is causing redundant code all over the place (see for example the command-handler-tree-service), this should really be more generic, right?

The DOM command handler needs to be implemented and the actual action in the actionregistry as well.

## 29.5.2019

Further steps in the node completion logic. They are now also hidden in the tree. Rediscovered the fact that you can't CSS animate the `display` property. I still think this is ridiculous.

We have further issues though: when completed nodes are not shown we also need to remove them from the DOM tree or all sorts of keyboard navigation logic no longer works.

We should try the rerender method first since that is the easiest? Allthough then the delay where the node is shown as completed and then removed is not really possible...

## 12.6.2019

I more or less finished the implementation of completing nodes by opting for the approach of rerendering the tree after doing a completion. This causes the node to disappear from the DOM completely and our navigation will work once again.

However, setting the focus after the rerender was not working.

This was caused by the fact that the rerender is asynchronous.

This was caused by the update() method on NodeComponent (see node-component.ts) that was async.

This was async because we have deferred node loading and the list of child nodes of a node is basically a promise that _can_ load nodes on demand.

We did this because we wanted on demand loading when opening a collapsed node and for allowing for node filtering even when some nodes are not completely loaded (by reiterating over the tree and on-demand resolving the unloaded nodes).

This is very clever but messes with our focus-after-rendering because I can't make REDOM treat the update method as async and await on it. It just executes it.

There are only two (involved) ways out of this: make REDOM understand async/await or see if we can't do the deferred loading differently.

In fact for on demand collapsed node loading we didn't actually NEED all that infrastructure since we load the complete subtree and replace the node in the original tree with that. (see tree-component.ts in the onClick() method)

So I started a branch to revert all the deferred loading stuff. This makes the code simpler again but introduces two problems:

1. When a node is collapsed we do not load the children. Clients need to distinguish between: the children were not loaded and there really are no children. Luckily in repository-eventlog where we load them, we have this information. For now I encode this by either setting the children to null (not loaded) or setting an empty array (no children present). This makes all subsequent client code more fragile and ugly since everywhere you need to test for that. Must be fixed later.

2. The second problem is a bit trickier: our node filtering no longer works. Since child nodes of collapsed nodes are not loaded at all anymore, you can not just take the current tree and filter it. That information just isn't there anymore.

I need to fix both problems.

For the second one: we probably need to modify our repository api to allow one to specify whether to load collapsed nodes or not, this is currently hidden in the implementation and can not be controlled from outside.

## 14.6.2019

Fixing the null issue first: introduced the concept of a DeferredArray that represents whether the array was loaded or not.

Note that I corrected the getChildElements logic in node-component, however now I need to make sure that I take the following into account:

    // There are a bunch of conditions where we ignore the "collapsed" state of a node:
    // If the node was filtered we may have hits in the children
    // If the node is the first node of the page then we always want to show it opened
    // if (!treeNode.node.collapsed || treeNode.filterApplied || this.first) {

Fixed the second issue as well: we now have an extra parameter to tell the repository whether or not to load the children of a collapsed node. I thought I could resolve all of this with just a nodeFilter, but of course in case of a collapsed node we don't filter out the node itself, but its children.

Therefore collapsed children need to be treated especially.

I added some logic to the node-component to always show a node when it is either NOT collapsed or it is the first node or it is included in a filter.

The code looks better now, I think this is the right approach.

## 28.6.2019

The undo function is broken again. After completing a node and undoing that operation the node is not shown. I debugged it and then it appears to work. I think my rerender is still not working correctly.

The rerender is actually working, the problem was that the UNDO command for complete, which is an uncomplete, was not set to synchronous. We were setting synchronous execution as a flag before by hand when we create the commands when the user triggers them, but in reality each command that requires a rerender should be ran synchronously since otherwise there will be a timing problem where the store may not have happened when the load is coming.

I fixed this more generally by making the synchronous flag be automatically calculated based on the "requiresReRender" flag and you can override it manually if needed. This is currently only used once in the Open/Close Node logic to load deferred children and then reload the tree.

Implemented a toggle for showing completed nodes, this also forced me to remove the special css classes we had for showing or not showing completed nodes since we now always either have them in the DOM or we remove them.

## 3.7.2019

Completed state is now implemented completely as far as I can tell.

Changed the persistence format for add or update events to optimise space used by having a bitmask for the 3 flags that we have and storing epoch seconds for both the timestamps.

Also removed redundancy in tree-service.ts by having a generic update method for changing properties on nodes.

Unsure whether this was actually worth it since I don't really know how indexeddb stores its data. But even if it just stores a serialised JSON blob it will be smaller this way.

We sacrified millisecond accuracy on the timestamps for this, but that seems unimportant for this use case.

Realised that while I could also make the flags be generic across the entire code base, we actually need to distinguis between different commands on the flag level because they may have different rerender semantics. So it does not seem worth it to pull through that refactoring.

## 5.7.2019

Did some code cleanup and refactoring and wrote documentation for dendriform in the README. Architectural strategies only for now, I still mean to have a diagram showing the various classes and how they work together.

## 10.7.2019

Did a performance trace of filtering the tree on my 8000 node workflowy import and noticed that about 400ms is spent doing indexeddb stuff, but about 1400ms is spent in marking up the html, a third ot that again is doing createContextualFragment.

This seems to imply that my multipass markup may be a bottleneck here and perhaps I can reduce the amount of fragment generation?

I tried some local optimisations to reduce the amount of node creations and it did seem to improve the performance a tiny bit, but not significantly.

It appears that the contextualFragmentCreation, which I have to do for each filtered node is really expensive in aggregate. I am starting a rewrite of this part to use a virtual in memory dom structure, generate HTML from that and then in the end just set innerHtml to the generated value. Let's see if that is faster.

## 12.7.2019

It was more complicated than expected. I had created a new way to markup using in memory pseudo dom elements and string concatenation for generating the html, but performance seemed to be mostly the same.

Turns out I was looking at the wrong method to optimise: the main cause for the time lost were the filter-calls for generating filterednodes which was happening way more often.

I refactored the filtering to also use the new pseudo dom method. This in turn causes the problem that since we no longer have ContextualFragments for the each name and note element but a string with HTML, REDOM can no longer just use that to create HTML elements. It had basically used the strings and escaped them and displayed them. So no more highlighting.

I fixed this by creating two DOM elements by hand and appending them to the REDOM element. This is all in node-component.ts and this is becoming increasingly untennable.

Positive with REDOM is that it can basically deal with whatever, it does not seem to care whether children are REDOM elements, strings or real DOM elements.

Not sure how incremental-dom would deal with that.

Performance is now also much better already: we only spend 375 ms in the markup method as opposed to 1300ms before.

A further optimisation I need to pursue is to make the findAndMarkTextMNode call to allow for multiple regexes at the same time. It could just increment through the string and try all the regexes one after the other and we'd only need "one" pass.

Also interesting is that the performance trace in chrome shows that luxon is now taking a not insignificant amount of time. Apparently the mapEventToRepositoryNode call does something with luxon which in this test takes 100ms in aggregat. May be worth looking into since we don't really need that data until the popup is shown.

After cleaning up the code and measuring again, I can no longer see the markup code taking any significant time. Really nice. May be worth to look into the luxon thing at some point, deferred parsing may be really worthwhile here.

## 17.7.2019

Refactoring the luxon date things: I am just going to store the seconds since epoch in all nodes and will format the date only for display on demand.

This is now implemented.

Removed all unused exports by using a new node module to detect these.

Cleaning up todos by listing them with the VSCode plugin. Specifically in rebuildTreeStructureMaps this was a significant change since we now filter by one event type only which should be faster since we can use an index.

## 19.7.2019

I fixed a bug where the beginning of a line of note-text was _sometimes_ not actually being highlighted (as a filter or link). This was due to the fact that we match on whitespace boundaries to determine "words" and in this case it was either the beginning of the line or the line was preceded with an HTML tag.

I extended the function to take those two cases into account but noticed that we need to revisit our note rendering and handling. This can now contain random HTML and I am pretty sure that our engine is not correctly dealing with encoding/stripping/marking up that stuff. We need a more robust story with notes and it probably needs to move into some markdown text editing thing where we preserve newlines and stuff and find a way to map that sensibly to contenteditable foibles.

The filter query could be parsed into an array of components that also contained the empty string, and apparently further processing (probably regex) on that empty string caused the browser to hang. I need to investigate this at some point.

For now I made the filter more robust by sanitising and normalising the input more.

The problem that uppercase search strings were not found is also fixed by automatically lowercasing query components in parseQuery.

## 20.7.2019 - Trying out Rollup

Installed rollup with `npm install --global rollup` and then plugins we need:

- `npm install --save-dev rollup-plugin-typescript typescript tslib`
- `npm install --save-dev rollup-plugin-node-resolve`
- `npm install --save-dev rollup-plugin-commonjs`
- `npm install --save-dev rollup-plugin-off-main-thread`

## 25.7.2019

Was able to replace Luxon by just native web APIs, Intl is now somewhat widely supported and fully sufficient for the formatting needs I have. Yay!

Decided to leave both rollup and webpack in the build. I can't really decide at the moment which I prefer. Features seem similar (at least for me), and bundle size seems about the same. Should I use the number/size of the dependencies as a guide? Is the bundle analyzer plugin an argument? Rollup seems to be faster though.

Tree shaking is problably not very effective for me because I have few dependencies, and of those that I have I use most of them. It would be nice if it could strip down dexie but I'm not sure it is able to.

## 16.8.2019 - Or Why Firefox Threw an Uncaught Exception

Apparently Firefox does not support IndexedDB in private mode. I was using that for testing and was getting a very non-debuggable uncaught exception which turned out to be in Dexie which could not create the IndexedDB databases. This was originally a privacy feature but has been logged as a bug for over 7 years. Apparently they are working on it.

## 21.8.2019

After puzzling over some non functioning indexeddb store code I found out that compound indexeddb indices on an autoincrementing primary key do not work in Chrome and Safari. See also <https://github.com/dfahlander/Dexie.js/issues/751>. The issue for me is the compound index on `[peerId+eventid]` since I use that to determine what events need to be sent to the remote peer (peerId = value and eventid > than whatever the latest ID is I know of the server).

There are only two fixes:

1. I can drop the compound index and just filter by eventid or peerId and then for each result filter out events with the wrong peerdId or eventid. In both cases I would query too much data, perhaps just filtering by eventid and then afterwards throwing away non-matching peerIds is the most sensible since this will converge eventually on the latest eventId and should keep sizes down?

2. I can generate my own unique ids on the client side and not use the autoincrementing feature of indexeddb. Since Javascript is single threaded this should be doable, but I would have to fetch the max id at db initialisation time.

Perhaps I will just implement the first thing and hope that performance is ok?

## 11.9.2019 - Fixing the Sync Issue

Back after a vacation. Decided to fix the sync issue by doing my own incrementing ids since that would be most optimal and in theory since we are single threaded it shouldn't be an issue (famous last words).

## 11.9.2019 - Sync Works, Need to Fix Initial Load

So syncing now works. The first load experience is not optimal though: we still have the original problem that on first load it creates an empty node and we then at some point get all the events from the server which get merged with our empty node.

Each new device we log into will trigger this and cause our tree to get messed up.

We need a special, dedicated first launch experience where we detect that we are starting from scratch, inform the user that we're trying to get our initial stuff from the server and wait until we have that. If we do this, make sure to document that we need to deal with this even more intricately once we move to batched event loading.

## 18.9.2019 - Strange sync/gc issues

I've been trying to debug strange sync or gc issues: with two clients open at the same time and just doing updates left, then waiting for right to catch up, then doing updates right and waiting for the other to catch up. At some point updates from the _originating_ node get lost on the originating node itself. Maybe the event is garbage collected where it shouldn't be? Perhaps our vector clock sorting is not working correctly? That's my current feeling at least. I don't think that the updates are not working.

I figured it out: I was using vectorclocks wrong. :facepalm:. I was only incrementing the clock for the local peer, I was never incorporating my knowledge of any other peer. So any event I was generating locally just had the local peer clock. I need to merge the local vectorclock with all remote vector clocks and I need to make sure I persist the vectorclock so we don't lose this information.

## 20.9.2019 - Sync issues the continuation

I may have fixed the incorrect (missing) vectorclock merging, but I have more problems. I think some are caused by the fact that it can happen that multiple peers have multiple ROOT nodes (because they initialize concurrently and don't wait for each other's updates necessarily). In addition I saw one case where a child was update on one peer and the change not reflected on the other peer. But it was visible after a reload. Maybe it's the same problem? Different ROOT parent?

I will try to special case the ROOT node so that we make sure there is always ONLY one ROOT node created and it is always created locally. We then need to suppress remote events that are trying to create a root node.

Once this is done we no longer need the special logic for initializing an empty tree when there are no nodes (since there always will be). This will then require us to create a button to create at least the initial node since otherwise there is no way to get started.

This then will also fix the issue where we can delete the last node and have no recourse anymore.

Maybe it's all for the best?

I'm still not feeling great about this, I may still have some fundamental problem here. What gives a little bit of hope is that parallel trees seem to behave better if one waits for the other and syncs all its changes...

## 20.9.2019 - Sync issues

This is getting tiresome. I now refactored the code to include a fixed ROOT node for each peer. The vector clock should be ok.

BUT in a sync scenario it is really easy to come to the situation that changes of one peer to the structure of the tree will not materialise on the other. Feels like maybe garbage collection is fucked.

## 27.9.2019 - Sync Issues, The Conclusion, Maybe

Last time we found out that the weird sync issues that still plagued are (at least also) caused by our misuse of the vectorclock. I thought I was storing VectorClock objects but after storing and loading the object in indexeddb it was just a hash of key and values pairs. This then caused our vectorclock comparison methods to be just comparing garbage. And in JavaScript comparing something to whatever of course returns a result. :facepalm:

Have now further typified the VectorClock type and reduced our StoredEvent interface to just refer to VectorClock values.

This seems to (maybe) have fixed our issue! First tests with two peers syncing seem to work fine. Yes!

## 6.11.2019 - Delete is Hard Now

As this gets more and more feature complete it becomes clear that it is becoming hard to delete anything in this system: as long as some peer still has the events, it will all sync and replicate across the server and to other clients.

This is of course by design, but it makes it non-trivial to implement use cases like a user _wanting_ to delete everything because he wants to start over.

We also do not have a story for dealing with multiple accounts on one server in one browser. In the current implementation, because it is the same origin and therefore the same storage in the browser it just uses the same data storage. And that may not be what we want.

This is partially caused by the fact that the server side component is "tacked on", the driver has been the client app so far and there is no notion of the client somehow negotiating with the server what documents it "has" and which ones it should sync to the server and in fact _display_ to the user.

Realistically we need something like an ability to associate an eventlog with an account on the server as an optional thing.

When dendriform is hosted (by me) this could be an initialization configuration passed to dendriform itself to tell it what document(s) to sync and display. In this way dendriform, when used without a server could just manage its own documents and when it _is_ managed by a server it will be configured with the set of documents to use initially. This way the server can start dendriform and make sure that the initial document is always something unique, tied to the account of the user (hashed username+UUID or something).

So we need two general features:

- An approach to delete everyhting in an eventlog (Is it a special event that indicates that from this point on all the past events are to be considered deleted? Or is it just marking that eventlog as "deleted" and starting a new one?)
- A notions of multiple documents and the ability to configure a dendriform client to use a "set" of documents initially. When logging into the server it checks whether you have any eventlogs and if so provides that set to the client, otherwise it will initialise and empty one unique to your account and give that to the client.

This means:

- We need an initial set of documents to manage
- We need a document switcher
- We need the current document id in the URL
- We need the ability to mark a document as "deleted" (soft delete) (BUT how do we send that to the server and have correct concurrent updates for this!? Do we need events especially to manage metadata? This would be really elegant and solve the concurrency issue)

The hardest bit here is going to be to go multi document, I knew I should have done that from the start.

## 6.11.2019 - Makine Dendriform Multi-Document capable

I have basically two strategies to implement multi-document capabilities:

1. Either I assume and enforce that the page is always reloaded for each new document so I don't have to implement any kind of shutdown and reinit.
2. Or I allow for dynamic switching between documents in which case I need to deinit all the appropriate things and reinitialize them afterwards.

I want to give the seconds strategy a go. Starting in tree.ts it needs to manage the document id as a parameter from the outside and react appropriately to update requests where the id may be a different one. Not having looked at this in detail I hope I can "just" leave the Tree object initialized and "just" switch out the underlying treeservice/commandhandler/eventlog.

Maybe I can do something about the fact that Tree gets the treeservice as well as the command handler injected? Can I factor those treeservice related bits out?

TreeService is also in the TreeActionContext... not nice.

## 8.11.2019 - Multi-Document thoughts

Thinking about multi-document. Seems like the document switcher component needs to be in the dendriform client since it needs to get its own metadata events in order to identify things like name and whether it is active or not?

This does not need to be a graphical component but at the very least a service of some kind. Maybe this is then also the manager to initialize the GUI component new when switching? Does this mean we need dynamic on the fly switching? Which means shutting down all processes etc?

## 13.11.2019 - Started Implementing Deinit of Everything

Started implementing the rampdown phases of all components. Had to build a little infrastructure to manage jobs running scheduled with setTimeout so we can reliably stop those scheduled jobs and clear all the timers.

Need a unit test for the JobScheduler to verify that it really does what I want it to. Since it is async it may be non-trivial to do.

Also refactored tree.ts a bit to get rid of some old code. We had to wait for the first server contact if at all possible so we wouldn't create an empty node and thus just proliferate empty nodes, but since we no longer create the empty node this is not an issue anymore.

Next step is to allow stop and deinit on the eventpump. `tree.ts` still needs more work to really have a mount/unmount API to the outside world. Instead of just functions we probably need to export a class (like a TreeManager).

## 20.11.2019 - It's All Broken

Apparently everything broke. I was fiddling with the styles to see if the breadcrumbs look right and created a larger list and then indented it and renamed some nodes to larger texts to check how it behaves. Upon reload it now has duplicated bits of the indented tree multiple times and no longer seems to be able to relate the children to the correct parent.

What _is_ this!?

Apparently the child parent relationship and the logoot sequence for the children of a node get out of order: the parent to child relationships are out of whack.

With 3 consecutive nodes a, b and c when moving c under b and b under a, in the end the relationship from b to ROOT remains and not the new b to a child-parent relationship. Is this a problem with our garbage collector? With the vectorclock sorting?

Further investigation shows that after storing a and b, and then indenting b to be a child of a, the vector clock somehow resets and starts counting at 3 again !? And does not seem to increase anymore.

I found it. Our own peer's vectorclock was resetting to a low value after each reload. The reason for this was that we _were_ indeed saving our metadata, including the vectorclock values. But when we loaded the vectorclock we were accessing the property `vectorClock` and not `vectorclock` on the saved metadata. Note the `c`.

AAAAAAAAAAAAAAAAAAH! Javascript!

I fixed it and now it seems to work.

Everything that is not type checked and/or tested is basically broken.

I should have a Typescript interface there too.

## 2019-11-29 - Initialisation Lifecycle Done

I now have a TreeManager that can create and initialise a new tree. This initialisation and deinitialisation cycle has been implemented on all relevant components.

Was able to replace the custom Pump implementation with the new JobScheduler by adding the concept of backoff strategies for timeouts to it. Very nice.

The manager is now hardcoded to know about one tree only, but really this should probably be extended with an indexeddb database that can be queried to get the available local trees and to merge that with the list of trees from the server.

What I am unsure about there is how to deal with the initial request: if we can't contact the server even once, do we just create a tree with a default name? Does that mean that the server should also do this? Should we prevent any local trees from being created without even the initial server request?

The latter would make things more consistent and to initially load and install dendriform you _need_ access to the server and therefore this requirement is not too onerous.

## 2019-12-11 - Initialisation

Thinking about the previous entry, perhaps we need to make the mode on how to operate in dendriform configurable: whatever integrates dendriform can decide whether it is just purely offline with some default eventlogname or whether preliminary contact to the server is needed.

This would support all use cases I think.

## 2019-12-11 - Rollup and ESM modules

As I think about how to implement the configurability for the treemanager I realized that we need to have our own javascript on the dendriform server to instantiate and configure the tree.

This brings up the question on how to consume the tree.bundle.js file from that page.

I started looking into pure ESM deployments and using script type=module to load those. The rollup configuration to split along node_modules boundaries is done but I am unsure on how to manage those imports in the index.html (manually?) and I still havce trouble debugging typescript in Chrome and Firefox using the rollup generated bundles and sourcemaps (not seeing variables correctly).

## 2019-12-18 - Debugging ESM Deployment

Got a bit further with direct ES Module deployment: the approach to split on node_modules boundaries seems to work in rollup. The thirdparties all get their own hashed file and both the tree and example entry points are converted to an mjs file that is basically an ES6 module.

Those entrypoints also have relative imports to the other dependencies. If I now change the reference in index.html to the example entrypoint (with a type of module) it seems to load fine in Firefox. And the app works.

I also figured out why debugging is fucked in Chrome and Firefox: the terser plugin in rollup apparently interferes with the build. When I leave out terser I can debug the app fine. Will investigate.

ES6 Support in browsers: <https://kangax.github.io/compat-table/es6/>. Seems like modern browsers including mobile are all fine with ES6.

Typescript compiler options for reference when editing tsconfig.json: <https://www.typescriptlang.org/docs/handbook/compiler-options.html>.

I removed all traces of babel and webpack from my build and rebuilt the package-lock file to reflect that. Will investigate some alternative minification but I'm not sure it is worth it when we consider gzip compression.

Minification for ES6 still seems to be pretty raw. Terser always pops up as the main choice but it does not work for me. Uglify is not an option and there is a babel minifier that is in beta.

Will remain unminified for now and assume that gzip is fine.

## 2020-01-08 : Continuing the Build Process Cleanup

Continuing where I left off. Cleaned up some dependencies and made the project issue free.

When trying to run tests I ran into the problem that jest requires babel to convert js files, this is triggered by the `transform` configuration in the jest.config.js. I tried removing this but that caused the same problem when node encountered export or import since node before version 12 has no concept of ES modules.

So I decided to upgrade to node 12 and in the process wanted to make sure I make my build environment a bit more explicit. So I added constraints to the package.json to specify what versions I require. Then I used nvm to install node 12 and then I wanted to build my project.

Then all of a sudden rollup is no longer available. Maybe that is an effect of using nvm?

Instead of having this installed globally I wanted to use npx to run the rollup binary from the node_modules folder and started refactoring the build scripts in package.json.

I got stuck there because if I invoke rollup with npx I get a weird `Cannot read property 'include' of null`.

Ok, so that works now, maybe just an npm ci was missing. Not sure.

Now the problem is that while node 13 (also 12) does understand modules out of the box, it only treats .mjs files as modules or js files that have a package.json next to them identifying them as modules.

This is a problem because apparently Typescript does NOT understand the .mjs extension. sigh

Not sure what to do now. I could move all the js files that are modules into a subdirectory and add a package.json file?

## 2020-01-10 - Reverting To Jest

I have reverted to jest with babel to run tests since I could not get the combination of typescript + javascript + modules + node + jest to work otherwise. I could not identify any alternative testing framework that would work well with this combo out of the box. Bit sad.

## 2020-01-10 - Investigation Into IDB

I want to try moving to use IDB instead of Dexie. It looks like a nice library, it is tiny and the API is more explicit and clearer I think. But maybe not so convenient. A plus is the native Typescript support with typed schemas.

I also want to try out lit-html. It looks neat, can probably do what I want, has escaping of content (I think) and it has no dependencies. Hyperscript has an annoying html-element dependency that I don't really need.

## 2020-01-17 - Conversion to IDB

Finished converting the first file to idb, looks nice so far, have not tried to run anything concretely yet. Getting weird type errors when I try to import the idb library with async iterators. I hope this won't cause trouble later.

Also the rollup typescript plugin does not output any type errors!? It's basically useless in build for getting warnings or errors. I switched to a different version but I'm not sure whether that produces sensible output.

## 2020-01-24 - Continuing with IDB

I need to continue converting code to use IDB but I have run into the fact that the current garbage collection code is woefully inefficient. It seems to work so far so maybe I can just leave it, but it nags me.

Let's just do the conversion first. Bite through this.

Converted all Dexie code to IDB and very happy with it. If the bulk add and delete implementions I made are working then I think this is superior to dexie. Especially the support for types through schemas is really nice.

Additionally cleaned up some dependencies (removed Dexie).

Found out that rollup is finally building a typescript plugin that is sensible with support for type errors. This means that as soon as <https://github.com/rollup/plugins/issues/105> is resolved I should be able to migrate to the official plugin. That issue also confirmed that my current choice for the `@wessberg/rollup-plugin-ts` plugin was correct.

Our bundle size is now reduced to 210 KB. Next up would replacing hyperscript with lit-html.

Also an idea: rename the 2 javascript third party deps I have to .ts and treat them as typescript files. This may make jest work without babel?

## 2020-01-29 - Testing IDB

Testing the idb integration and found some issues. I did have code that was expecting async iterators but you need the extra idb package that I can not currently import correctly. This is ok since that would reduce my browser compatibility significantly.

Rewrote the async iterator code to just use a cursor.

Trying to test the new idb implementation I realized I would have to manually modify the index.html each time I build the code because the filenames for all entries now contain hashes. I went looking for rollup plugins to do this and had to weed through 2 other more common google hits that were worthless before I came across `rollup-plugin-html2` which even allows for injecting the script tag as a module.

I had to add an http server to the npm scripts because with the `./` syntax of the module imports in index.html Chrome would no longer load the js files because of cross origin errors.

And the application seems to work, merging this into master.

Found that you can set a specific word wrapping configuration for specific file types in visual studio code. Word wrapping in markdown for example:

```javascript
  "[markdown]": {
    "editor.wordWrapColumn": 80,
    "editor.wordWrap": "wordWrapColumn"
  }
```

## 2020-01-31 incremental-dom

Having a go at replacing redom with incremental-dom. Since we don't really use redom other than as a convenient replacement for creating manual dom elements this could be a real benefit. In particular redom doesn't incrementally update our tree, we basically rerender it all when we do a backend update.

Did a bunch of reading and I think that lit-html actually does a similar thing to incremental-dom and it would also be a replacement for hyperscript. So I'm going to try that first.

## 2020-02-06

Refactored `node-component.ts` completely to lit-html and it definitely looks better. Much more understandable and it's shorter because there isn't so much dom API kvetching.

Some downsides are that debugging is way too arcane: when you make a mistake in the template the error messages at runtime are almost unusable. You need to then visually inspect the html and try to figure out what is up.

lit-html also assumes it is basically rendering everything. For the use case where a new node is added as a child of the current node in a particular position I am now rendering this using lit-html as a child of an artificial dom node and then hanging it in the correct position. This seems unnecessary.

lit-html also generates synthetic comment tags `<!---->` at various places in the dom, I think to mark certain areas as potentially dynamic content. This makes the tree harder to read and of course makes it so my dom operations need to be more robust in the face of this spurious markup.

Still don't know whether performance is any good or not. I will have to run my 8000 node experiment again and see where the rendering time goes.

`blogpost`

A "problem" when using declarative templating is that you are not using code to construct your dom tree and therefore you can not use custom elements as object (AFAIK) but you must declare them using html.

This forces two patterns:

- expose all your configuration parameters as attributes
- expose all your dependency injection requirements (like what funcion or object do you require to operate) as properties

When the element has been added we must make sure to inject all the required dependencies before using it. This seems a little bit more unsafe, but allows for the declarative approach and it seems to work. See `a4-spinner` usages in tree-component.

I use an additionaly technique where the spinner will find the component it has to show activity for by looking for a class in its ancestor tree and to select the closest match. This is the reverse of injecting the object to observe and used as an alternative that does not require injection.

Maybe I want to try to port <https://github.com/volument/baretest/blob/master/baretest.js> to typescript and to es6 modules and arrow functions and try to use that to test my code?

## 2020-02-09 Moving the test framework to tizzytest

`blogpost`

Inspired by <https://github.com/volument/baretest/blob/master/baretest.js> I wanted to move my testing setup from jest to something similarly minimal.

We use jest at work and it works fine, but it is an enormous project with many dependencies. In my personal project it was the last thing holding me back from removing babel as a dependency. baretest's incredible simplicity motivated me to try to replace jest with something similar.

I transformed baretest into typescript and added it to my project. Since I still need some form of assertions in my tests I decided to use Cylon (TODO link) as a more or less drop in replacement for the jest assertions.

Since we no longer have jest doing all kinds of magic we can't just have tests sprinkled over the workspace and automatically gathered and executed. Instead we now have a manual test suite that gathers the individual test files and runs them:

```javascript
// Set up a fake dom environment for tests since we are not in the browser (see https://github.com/rstacruz/jsdom-global)
import 'jsdom-global/register'

import { trun } from '../lib/tizzytest'

// All the tests
import './vectorclock.test'
import './domain-search.test'
import './keyboardshortcut.test'
import './logoot-sequence-wrapper.test'
import './markup.test'
import './util.test'

// Run tests async since the trun is async
;(async () => await trun('All Tests'))()
```

`tizzytest` is my typescript conversion of baretest. I run this file with `npx ts-node test/runtests.ts`.

Doing this conversion I stumbled on a few interesting issues:

`ts-node` spat out "navigator is undefined" as an error message. This was typescript complaining about code that was using browser APIs and in a node environment those are not available. Presumably jest provides all this out of the box. Some googling made cleat that the typical solution is to use `jsdom` as a headless dom implementation and more specifically `jsdom-global` has a register module that sets up a basic browser environment for exactly these cases.

This explains the top line in the `runtests.ts` file I included:

```javascript
import 'jsdom-global/register'
```

The second issue was ts-node having trouble loading pure javascript files and treating them as es6 modules. This is a known issue with node. You can work around it by renaming the file to .mjs which makes node see it as an ES6 module, but typescript doesn't currently support this exetension for loading dependencies.

My fix for this was to simply rename the file to .ts and treat it as a typescript file. This is always an option since Typescript is just a superset of Javascript.

In this particular case I think running the tests with my own simple runner is absolutely worth it. This does not mean that using something like jest is a bad idea. At work we use it and it makes sense. As soon as you need more of the many features it provides and you have a team of people working with the technology that has support, issues and documentation then it may well be worth to depend on something that is a bit more heavy weight.

This is the same trade-off one has with all libraries and frameworks: when does it make sense for me to use it and when should I maybe try to do something myself. There is no one size fits all answer to this question. But it is always worth asking these questions and discussing them.

## 2020-02-09 lit-html refactoring done

redom and hyperscript have been removed from the project and everything renders with lit-html. Had to fix a few errors that were there regardless of the rendering approach. For the moment everything works except for the popup menu.

## 2020-02-12

Realized dialogs do not work. Refactored a bunch of code around. Then noticed that I misunderstood something fundamental about custom elements: you don't have access to children defined inside of the custom element in the HTML. At least not just like that. I'd rather not go shadow dom and templates and slots so I need to find another way to embed the menu items into the menu.

## 2020-02-21

Trying to make something work with shadow dom: i want nested custom elements.

I think what I want to try is to have a `<df-dialog>` element that can then be filled with things like the opml thing or the treenode-menuitems. So the dialog as a slot and the children slot into that. Maybe.

It seems like the tree-menu-component.ts is not being included in the build!? Why? Where should I put my code statements like the customeElements.define calls. Are those not executed? Is import not enough?

## 2020-02-26

`blogpost`

Figured out why the `tree-menu-component.ts` file was not being included. For Typescript that file was not being actually used in any way that was relevant to the emitted Javascript and therefore it dropped it. This is explained in <https://github.com/Microsoft/TypeScript/wiki/FAQ#why-are-imports-being-elided-in-my-emit>.

Typescript was not wrong, but it does not detect that the module has side effects - defining custom elements - that are importatnt.

The workaround is to explicitly import the module file.

## 2020-02-26

I got custom elements to work: the key was using the `<slot>` element to make child elements appear. Then we have the option of rendering with and without shadow dom: with lit-html this just means the difference between rendering with a target of `this` or `this.shadowRoot`.

I decided to go with shadow dom for the reusable components such as the dialog and for the treeMenuItems that are of course specific to dendriform but let's see.

`blogpost`

I installed the lit-html visual studio code plugin that offers CSS and HTML syntax highlighting inside of lit-html templates. Very helpful.

`blogpost`

It is possible to use Promises inside lit-html templates: there are a few constructs to deal with them, the most basic is the `until` function that will replace a default placeholder content piece with the real content when it resolves. Nice.

## 2020-02-26

`blogpost`

Dialogs got nicer with the containment: I feel like using shadow dom and local styles made me think more about encapsulation and where the logic should be. That's a benefit.

## 2020-02-28

`blogpost`

You can reach the child elements inside a custom element using shadow DOM by getting the respective `slot` element and then calling `asssignedNodes()` on it.

## 2020-03-04

Due to the refactoring of the dialogs I've drifted to a different design for the tree actions. This does not feel wrong, but not sure it is final. I will have to refactor all the actions in the tree-actionregistry and then we'll see.

## 2020-03-11

The actions look good like this, more contained.

Upgraded to rollup2 and I removed my manual css copying phase and replaced that with the rollup `copy` plugin. Together with the built-in watch mode for rollup (using `chokidar`) I can also remove the npm-watch dependency and let rollup do that. Won't work for css though?

It doesn't work for css. It's strange, the rollup watch mode can be configured with a glob pattern on what files to watch but for some reason it only takes into account ts and js files. Does it only consider files it is bundling and that match the glob?

## 2020-03-13

The dialog for opml import does not work right yet. We do not give an indication when the import itself is done. Closing of dialogs is wonky. And there is no indication that the storing of the events is still ongoing.

Also the GC times after the import are way too long. I need either webworker or some optimisation and probably both.

## 2020-03-18

`blogpost`

It seems like common shared styles for web components are not completely solved generically. There is a cavalcade of sort of maybe options as discussed on <https://www.smashingmagazine.com/2016/12/styling-web-components-using-a-shared-style-sheet/>. The two "best" options at the moment seem to be the inclusion of a `<link>` element before your inline styles for the web component that points to a shared stylesheet or to actually inline all the shared styles. I have currently opted for the latter, but will try the former.

## 2020-03-27

I think I've fixed the GC performance issue, mostly. I switched to a histogram based approach: on startup I count how many events there are for a given discriminator key. This means that all counts larger than 1 indicate that some events can be garbage collected for that key. In the regular GC cycle I go over the historgram, gather deletion candidates and bulk delete them.

The histogram generation requires all stored events and builds a large map in memory. The downside is that this takes quite a bit of time (around 1.5 s for 10 000 events in the workflowy export) and quite a bit of memory. On the other hand there is only the up front cost and each real GC phase afterwards is much faster because it is so efficient to determine candidates.

Originally this initial histogram building time was blocking the UI but I've moved to an approach to use a cursor to iterate over the indexeddb events and to read only batches events scheduled in a requestAnimationFrame (RAF) call. I try to automatically adjust the batch size based on the time required and to stay under the 16ms between frames. This is not yet perfect, especially my batch size determining algorithm is suboptimal, but it is much better and it basically prevents any pauses. FPS only drops to 40 or so while running.

Two remaining optimisations I could do:

- Do the actual GC calls with the same approach: when a lot of events need to be GCed (lot of editing in the tree) this GC time can also ramp up to more than 100ms
- Do the batch size determination more robustly, in fact instead of determining the batch size, I should just check the time

I implemented the time based windowing, that does work more stable. During the histogram building I still get a lot of dips in FPS that seem to contain only JIT and GC work from the browser. Am I generating too much garbage?

But it seems a bit better.

## 2020-04-22

We've come to the point where we need to resolve the last (?) big open question in our solution: who is authoritative regarding what events are the truth? Or to put it differently: who decides what the right amount of events are and how do we synchronize the state?

Some reading on the internet leads me to believe that to reliably sync the state of all peers with each other over the server we would need something like a merkle trie based approach. This would be quite complicated to implement however, and I might consider moving to a state based CRDT with merkle updates as described in <https://hal.inria.fr/hal-02303490/document> then anyway. This may be something for some future implementation.

The alternative is to make some assumptions:

- The peer is authoratative on what events exist from that peer. It will incrementally synchronize them to the server by asking it what the last eventid is it knows (assuming they are monotonically increasing) and sending newer ones if they exist.
- The server is authoritative on what events exist for all other peers.

There are some massive constraints we need to take into account with this approach:

- This only works if the server is the real source of truth: as soon as the server DB gets deleted, all clients should also delete their state since we can no longer guarantee it will be consistent otherwise. This is probably even true when the server state is deleted for the peer itself. It would have to delete itself as well?

Writing this down like this I'm not sure we can make this tradeoff. We could make the tradeoff for a short time so we just have something up and running but it does not seem viable for the longer term.

In the longer term we probably need a robust approach for the client reliably and incrementally replicate its event log to the server and the other way around for the server to reliably and incrementally replicate the event logs of the other peers to the client.

## 2020-05-20

Thinking how I can implement event synchronization between client and server.

I need the concept of authority: a peer is authoritative over its events and the server is authoratative over all other peers (for that particluar client). This allows us to do something like use merkle trees to efficiently compare who has what state and to figure out from whom we need to download/upload things from/to.

If we do use merkle trees then I feel like we need to limit our merkle trees in depth to prevent humongous memory requirements and this then means large leaf node buckets for events.

Now if I want to generate hashes for those leaves then either my hash function must be associative (order is unimportant) or I need a stable ordering for those events. Currently I have no cross-peer approach to do this since I don't store the localId in the database. I may have to add this, or find an associative hash function that is sufficiently robust.

Another problem is that I currently delete nodes when garbage collecting. This means that I will throw away received nodes which will change the event list and cause me to synchronize those events all the time. I will need to change delete to a soft delete and have efficient ways of ignoring those nodes when querying. Associative hash functions are not a thing AFAIK. So I need ordering which means the localId from DEvent?

Concrete base changes required:

- Keep tombstones for deleted events and allow for efficient filtering
- Store the full UUID localId property for each event to allow for ordering (and hashing)
- I need a way to filter by originator (index) as well since merkle trees need to be calculated for each originator id separately

The same needs to happen on the server, BTW.

<sigh>

This will never end, will it.

## 2020-06-03 - merkle trees and how to synchronize them

Let's assume a fixed depth merkle tree so we don't run out of memory. This means the leaf nodes contain hashes of a range of events. There is one tree per originator.

The events are ordered monotonically using their originator ID and the local integer event ID.

The tree is always of the same depth. Meaning that even if there is only one event in the tree, it will live at whatever configured depth and the tree will be a highly imbalanced tree with one branch going to full depth.

This is done so we remain more or less stable when adding events: when you append new events (see ordering above) you at most change one leaf node (and with it the path to the the root).

The synchronisation algorithm would be:

- start at depth = 0
- authoratative party sends all nodes at depth
- receiving party sends back whether those nodes match or whether it does not know some of them
- authoratative party stops sync when all node known, otherwise it will go one level deeper and repeat the process
- when reaching a leaf node that is unknown by the receiving party all events in that node are sent to the receiving party (TODO this could get big? is there even a way to prevent this? batching?)

The complete synchronisation runs constantly and when no changes are present only the root tree nodes are compared.

We need a merkle tree per originator, both on client and server.

Do we need to persist the merkle trees? On the server we can't keep them in memory, so yes. On the client we need to keep it in memory but I don't know how big they can get and how slow they are so maybe also yes.

Maybe we just persist the leaf nodes with the hashes of event ranges and rebuild the rest of the tree in memory when needed?

Since a leaf node hash is a hash of a range of nodes LH = H(Nn, H(Nn-1, H(Nn-2, ...))) and therefore can be incrementally updated when new events arrive. We probably also need to be able to O(1) identify the leaf-node-range to update by dividing the event id by the number of elements in one range and just forming buckets like this.

Building the tree layers on top of the leaf layers just consists of iterating through leaf nodes in order and building new nodes for every pair of leaf nodes and then to repeat that for the next layer.

The question is what do we do on the server? Persist leaf nodes and then use a caache with a fixed size for the rest of the nodes and then recompute on demand? It could work: if you get a request for a non leaf node you can just ask the cache and it can compute it on the fly by requesting the hashes of two child nodes, etc.

The only good news about all of this is that we can work with the local integer IDs of each event instead of the UUIDs. Yay.

BTW I currently have a collision with localId and the id I would need for this thing: I currently use the localId for all nodes and increment it on the client. Do I need a second localOriginatorId that just reflects the locally generated ID? But then I need two counters? Can't I refactor to using originator ID + localId or do I already use localId extensively?

## 2020-06-24 Giving up on Merkle Trees For Now

After spending a few fruitless sessions thinking about how to make merkle trees work for our event distribution mechanism I have decided to abandon it for now. I still don't see a good way to extend "normal" merkle trees to be efficient when constantly updating them concurrently: the tree itself is constantly changing and you don't limit changes to some localized part of the tree itself.

Approaches such as the INRIA fast search trees would work but they kind of presuppose a completely different storage schema and maybe even a different CRDT structure and that is too big a change for me to make right now.

I will revert to a simpler approach where I _do_ keep track of authoratative authors for events (basically the originator is always authoratative) and then track per authoratative source what the max event ID is and which I don't have yet. I will send the local clients missing events to the server (batched) and will receive them from the server per other originator.

This is far from optimal but it is simple and I think it may be sufficient for my pedestrian needs.

At some point in the future I would like to have a better approach for incremental synchronization that is totally robust.

## 2020-07-22 Simple Sync Approach

The algorithm for the periodic sync in the new simpler approach:

1. client asks server for his current state of the world
1. if he doesn't know our max event Id yet, send a batch of local events
1. for all other originator ids:
1.   if we do not know the max id yet, fetch a batch of it
1. repeat with backoff

I reimplemented the eventpumpt to have this logic, this requires one new controller for the server and we need to verify whether we support "originator" instead of notForOriginator on the eventlogs endpoint.

Unclear whether something is missing on the client after that but then we should start testing.

## 2021-10-29

1. Refactor towards a move-op model as per Kleppmann
  1. I think Lamport timestamps offer sufficient semantics to order our events
  1. We would need to reduce our kind of events to the single move operation (reparent in our case)
  1. We need to store the logoot sequence ID inside of the child node payload so we can reconstruct the logoot sequence once the parent know who its children are . This also means getting rid of the logoot delete events, which _should_ be fine if we alwazs construct the sequence anew based on a consistent set of children
  1. Proposal for a process:
     1. ~~Move from individual event payload fields to a payload blob~~
     1. Factor out REORDER_CHILD event by storing logoot ids in the child nodes and doing lazy rebuilding of the logoot sequence. This also implies no longer using logoot deletes
     1. Merge the ADD_OR_UPDATE and the REPARENT event into a reparent event (this may involve removing the deleted flag and instead moving to trash node)
     1. Move from vector clocks to lamport timestamps
     1. Investigate how to proceed to refactor current implementation to the Kleppman omove-op  model (efficient query and storage needed, redo garbage collection?)

## 2021-10-29 Refactoring the event system to a single move-op

* I have no child id ordering anymore. The parentChildMap is empty, no replacement yet
* I removed the implicit ROOT node publishing so we always have it, the idea is to try to have it as a hardcoded node, the same as TRASH
* repository-eventlog now always does a rebuild and notify when an external event comes in since all events are potentially structural. We "just" need to refactor rebuild at some point to do the undo/redo semantics as in kleppmann
* All changes to nodes (moving, payload changes and reordering) causes the complete event to be duplicated. This means that even more than before we will be schlepping around notes and node name duplications. Once this refactoring is through I will need to start thinking about what to do with that data. Especially with nodes, but perhaps also the names. Should those "attachments" to a node just be child nodes of a different type (no logoot ordering, some type identifier in the payload?)? Are there other options to treat these payloads out of band? Maybe treat them all as children of another pseudo node called ATTACHMENTS and have the ability to refer to them by ID (would this also enable linking of nodes? in that case they would be special kinds of links) 
* We definitely need to redo the map rebuilding, we can't retrieve all events every time. Also, we have a getAllLocalEvents() method on eventlog that delegates to the repository for a similar call. This is for getting the new events to send to the server. AFAICT this also causally sorts and deduplicates the events, which we probably do not want to do for sending to the server! I removed the sorting and deduplication stuff.
* add the logoot position to the event payload!
* I remove the bulk tree loading option and always load recursively. Will need measure whether in the future I still need bulk loading. (`repository-eventlog.ts`)

## 2021-11-03

Given that we need to modify our approach to really do an undo-redo cycle when getting new events, it may be beneficial to move to lamport timestamps from vector clocks.

Lamport timestamps would allow us to have an index on lamport clock + peerid and to query efficiently for all events newer than a particular timestamp.

I also came up with a storage scheme and maybe garbage collection for events.

Assuming lamport clocks:

* Storage IDB:
  * eventRepository (lamportclock, peerid, payload)
  * treeRepository
    * nodes (nodeid, parentid, payload)
* Storage Memory: just parentid -> child-logoot-seq 

Looking up ancestors and node details is an IDB query. 

Theoretically I could persist the logoot sequence with the node as well. Not sure what's the better tradeoff here. Keep in memory for now?

Klepmann says that garbage collecting the log is trivial, but they assume a fixed replica set and I have a dynamic replica set (bunch of peers).

I did not find an easy/obvious distributed dynamic replica set join model that may allow us to securely define the current causally stable set of events. The closest is <https://soft.vub.ac.be/~jibauwen/publications/splash19-memory-efficient-crdts-dynamic-env.pdf> but its description is incomplete (see also <http://uu.diva-portal.org/smash/get/diva2:1441174/FULLTEXT01.pdf> for an evaluation).

I came to the realization that we have another approach since we do not really require a fully distributed p2p model. We do have a server that we can assume and that knows the entire "truth" so we can leverage that.

Using the server we can implement a join protocol and therefore manage the replica set. It should be possible to define a protocol with a join operation (from client to server) and a currentReplicaSet operation (from client to server) that returns the current known replica set and to make sure that these are mutually locked. That is to say: any currentReplicaset queries would block until an ongoing join is finished and the other way around, a join is only allowed when all currentReplicaSets are finished.

**join(peerid) -> new clock** (one higher than the highest known clock of all currently known replicas).

**updateReplicaset(replicaid,clock) -> replicas(List[replicaid,clock])**
  This increases the replica'id's clock to the provided value and returns the current list of all replicas and clocks (including the new one)

A peer can only call updateReplicaset after having sent all remaining events to the server, and getting all remaining events from the server.

A peer can then only perform garbage collection after having called updateReplicaset. This guarantees that all known replicas are included and any replicas that were just trying to join will get clocks higher than the returned values. This prevents garbage collection of events that may still get concurrent updates. If a replica goes offline for a long time, its clock will remain on a low level and prevent events concurrent or newer to be garbage collected.

This will effectively allow safe garbage collection, but it does not account for nodes going offline and not returning. They could cause garbage collection to become increasingly ineffective as we can't collect garbage anymore.

Perhaps there is a way to extend the membership protocol to account for this kind of situation, not sure how. Perhaps by saying that a replica is not allowed to send events to the server if it has been longer than TIME since the last synchronisation. And that it first has to get up to date with all the information and discard local events? Maybe the strategy for what to do with the aged local events that were not synchronized can be left to the user?

I think we can implement this membership protocol alongside the normal event synchronisation protocol, we just need to make sure the replica clock is updated from both sides.

Implementation approach:
- implement the move-op log with the storage scheme we described above without garbage collection and with a migration to lamport clocks
  - create a new IDB storage repo with a table for nodes with their parent relationship
  - create a new repository implementation paralell to repository-eventlog that uses the original eventlog and the new tree storage thing to implement this
  - we should be able to seriously reduce eventlog.ts as well since a bunch of that stuff should move to the new persistence implementation
- modify the server to the new event approach and make sure the eventpump and the undo-redo ops are working
- implement the membership protocol on the server and client 


## 2021-11-17 Notes on reimplementation

It's all a bit complicated in my head, but I am in the middle of trying to build up my backend based on log move records and I need to write some stuff down.

I have removed the localId from all event storage in the new schema. This used to be used for determining a counter to determine what events we have already seen or not. I have the feeling that this should be solvable with purely the lamport clock value. That should suffice as a watershed to identify new events (as long as I couple it to a replica id).

I can send events that are higher than a certain clock value for my own replica and I can requests events with a certain clock value for other replicas since I can assume the invariant that clocks are monotonically increasing for all events. There can never be a newer event from a certain replica that has the same or a lower clock than the ones I know.


## 2021-11-26 implementation notes

I have added a setClock method on the IdbReplicaStorage, but this seems like a bottleneck. Perhaps rather derive the current maxclock from the actual logmoverecords?

## 2021-12-10 uncertainty about how to handle the ROOT node

It is unclear to me where we want to handle the special case that is the ROOT node. For now I have added the ROOT node as a special case to the moveoperation.ts loadNode method.

BTW tests are absolutely critical for all the functionality. Can't believe I didn't have any for the storage before. :facepalm:

## 2022-01-04

I have implemented the missing support for remote move operations in the moveoperation.ts. Theoretically this makes the backend for the repository feature complete.

It is still annoying that there is such a duplication in logic between updateLocal and updateRemote methods. Can't find a good way to abstract out the common logic. I will at least need tests to check this.

Which brings us to the next task: write tests for all that new remote update logic and perhaps also its interaction with local updates!

## 2022-01-19 

Got the tree working again in the browser and ran into some problems.

Clock management was not threadsafe (we were not incrementing atomically). And we have some general problems like putting stuff in the wrong map. This didn't get caught in the compiler because I forgot to add type declarations to the local variables.

We can now store and load nodes again.

Where I left off: reopening a collapsed node does not actually load the children. I need to reload the page to see them.

## 2022-01-28

The storage tests I have now run through successfully.

Ran into a missing parent node problem when importing a large opml file. Turns out I was not actually awaiting all the treeservice operations in treeservice-commandhandler. This should never have worked correctly.

Importing the full workflow opml export now works, but it is slow. It does finish in a minute or maybe two, but there is no progress indicating.

There are still bugs with opening a collapsed node, it does not correctly rerender in all cases.

# 2022-02-02

Fixed a few bugs related to opening a node (wasn't set to requiresrender) and splitting nodes was inconsistent between the actual DOM operation and the backend updates we were making. This is now consistent.

# 2022-02-04

Improved the layout and styling of the opml import dialog by diving into some form styling details.

Noticed that the main tree component is not yet shadow DOM. And since it still uses the main css file it does not profit from changes to the shared common styles.

There are still some styling things to tweak and optimise, but in general it feels like the next big step is to implement the logmoveops event pump with the new model and to adapt the backend to deal with this new approach. Since this also involves implementing the new joining model for nodes this will be a bit more involved.

Where I left off: start client server protocol implementation

# 2022-02-06

Some notes on a client server protocol and invariants.

We replace the static replicaset with a dynamic replicaset that is protected by server side consistency guarantees. The basic guarantee is that at the moment you get an updated list of replicas from the server, that is basically the fixed set of replicas at that time and it is guaranteed there is no other replica with a lower clock. This then allows a client to determine the causal stability threshold based on the clocks and subsequently allows it to garbage collect events.

This also means that the server needs a dedicated operation to manage the replicaset. This **join operation** will get a write lock on the replicaset. All other operations take a read lock on the replicaset.

The only other operation is a **sync operation** that consists of the client (optionally) sending a batch of events and (optionally) receiving a batch of events. Each sync operation sends the current state of the clients view on the world so that the server may determine what events to send back. The server always returns its current view on the replicaset.

Assumptions:
- everyone sends events in ascending clock order (at least per replicaid)
- clients are responsible for tracking the max clock they have sent to the server and that the server received (may have to revisit this in the future, could theoretically send it back on sync, this would allow an initial empty sync operation to tell the client where it left off)

## Join Operation

Context:
- This operation holds a write lock on the replicaset in memory on the server so it is guaranteed that the sync operation gets a consistent state. Inversely this update can not continue until all pending sync operations have finished.
- This is a possible source of contention but the assumption is that join operations are extremely rare. The scope of the lock is also limited to the replicas for the specific document.

Request:
```
POST /documents/<docid>/replicaset/{replicaId}
Accept-Type: application/json
```

Response:
```
{
  alreadyKnown: <boolean>
}
```

## Sync Operation

Context:
- It is the client's responsibility to track the max clock that it has sent to the server.
- Client and Server MUST always send events in ascending clock value (per replica)
- Events are sent in batches that are limited in size. Clients determine server batchSize with a parameter.
- Client events that have a replicaId that are not part of the known replicaset will be rejected with a 400 Bad Request. The client must join first.

Request:
```
POST /documents/<docid>/replicas/<replicaid>/events?batchSize=<int>
Accept-Type: application/json

{
  // Unsent events by the replica, can be empty
  events: [{logmoveevent}]

  // Current state of the replicaset as known by the replica.
  // Used by the server to determine what to send back
  replicaset: [(replicaId, clock)]
}
```

Response:
```
{
  // Events the replica does not yet have, server 
  // decides the strategy for sending events. Either
  // per replica or just round robin or whatever.
  // But always with a monotonically increasing
  // clock per replica.
  events: [{logmoveevent}],
  
  // Replicas known by the server, including the 
  // current replica and their maxclocks. For the
  // current replica this includes the clock of the
  // events that were sent in the request.
  replicaset: [(replicaId, clock)]
}
```

# 2022-02-09

Considering how to implement the join protocol on the client side. Adding this protocol means that the client should not start accepting and storing events until we were able to make a connection to the server at least once to join the replicaset.

It seems we need something like the ReplicaSetManager that at least the IdbLogMoveStorage depends on:

* If it does not yet have events stored it must ask the ReplicaSetManager for the start clock, this can only be gotten by joining a replicaset
* If it has no start clock, it must refuse to store all events (throw a specific error that we can catch somewhere sensible and display an error)

One problem is that the replicaset manager must ask the logmovestorage for its current state of the replicaset (what max clock have we seen for each replica?). This causes a cyclic dependency. Can we avoid this? Must we?

Perhaps the solution is to split the join protocol and the sync protocol implementations: this way the logmovestorage can ask the join protocol about the start clock, and only the start clock. And the sync protocol can ask the logmovestorage about the current view of the world and events to send to the server.

# 2022-02-11

I had an aditional thought on the join protocol implementation. I think we need to perform the join operation at each initial server connection as the application loads and not just on the initial connection. This way we can verify whether everything is in order. This will lead to some increased contention on the replicaset lock, but I feel it will still be very minimal?

This will lead to the following possible states:

- Assuming we have _no_ local start clock:
  - the server is not reachable: we can not start accepting local changes (**OK**)
  - the server is reachable and it does not yet know us: this is fine, we can store the startClock and start working (**OK**)
  - the server is reachable and it does already know us: this means the local client had its data reset but is known, this is inherently a problem state since we should also have a new local replicaId that the server does not know. (**ERROR**)
    - Recovery should probably be to reset everything locally and to restart with a new replicaId. The old replicaId will be dangling on the server

- Assuming we have _a_ local start clock:
  - the server is not reachable: we can take local changes, we are offline (**OK**)
  - the server is reachable and it tells us it does not known us yet: this means that we are not known by the server but we think the server should know us. This is the most _dangerous_ state as we need some sort of recovery here (**ERROR**)
    - Recovery: export OPML and reset local document?
  - the server is reachable and it tells us it does know us: this is fine we can start syncing changes. (**OK**)

We also have some error handling to do with technical server errors. We need to distinguish between 5xx and 4xx statuses: 5xx is like being offline, 4xx is our fault and we could potentially communicate some nuance to the application and inform the user.

Like 404 is basically something is wrong with the client application and you should contact the owner. BAD REQUEST is basically the same.

NOT AUTHENTICATED would be a hint that the user should log in. 

But with all those flows if the app is written correctly and installed correctly, they should not happen so maybe not spend too much time on this now.

# 2022-02-16

Added the `prettier-plugin-jsdoc` prettier plugin to my configuration and configured it to use an 80 column with for JSDoc comments in prettierrc.js.

This plugin can autoformat jsdoc comments, specifically wrapping. It conserves newlines. Seems like it will save some time when writing JSDoc block comments.


# 2022-02-16

Started modeling errors around the join protocol. At the moment we distinguish between application errors (see domain/error) that can be percolated up to the GUI and be handled by a person, and local errors that are modeled as custom Error objects in a subsystem of dendriform that form part of the API of a certain service.

Splitted the HTTP specific parts of the join protocol out of the implementation. This will allow using a mock implementation for tests.

# 2022-02-18

As I integrated the join protocol into the actual code I run into some questions. The only place where it currently needs to be is in IdbLogMoveStorage since this is the place where we consider what the max clock is that we know and where we need to make sure that we have joined the replicaset before we can start doing anything.

Since we check the clock status in the IdbLogMoveStorage initialisation we would fail the entire chain of application initialisation if we have not yet joined the document replicaset. This is correct, but it also means that the application can basically never get started.

We need a mechanism, with application (GUI) support that waits until we have joined the replicaset for a document and then proceed with initialisation.

Instead of somehow complicating the entire initialisation process I have the following idea:

- IdbLogMoveStorage gets expanded to move its clock initialisation logic from the constructor to an ensureClockInitialised() helper that is called before any operation that relates to clocks. This would basically throw when the replicaset has not been joined yet since we can't get a startClock. This will then cause all of these operations that are basically mutations of the tree to fail when we have not joined the replicaset yet.
- In parallel we make the tree-component aware of the join protocol as well and it will not allow loading or showing the tree as long we have not yet joined the replicaset.

# 2022-03-04

Join protocol tests written. Next up is the sync client implementation.

Since we are implementing the sync protocol separate from the join protocol we are ok in having a dependency to the moveoperation. The sync protocol needs to periodically:
* get new local events to send to the server and transmit them in monotonic increasing clock order and in batches
* get the new server events in monotonic increasing clock order (per replica) and in batches.

As we also get the view of the entire replicaset from the server with each request, and we have the guarantee that this view is consistent, we can use this information to schedule garbage collection.

For each replica, the smallest value of our maximum known clocks of all replicas denotes the causal threshold. All events with clocks smaller than those threshold values can be safely deleted.

We will postpone this garbage collection implementation until we have the basic syncing working. We can just submit new updates on the server's replicaset view to _some_ service in our architecture and just do a noop there for now.

Later we will need to spawn a regular gc job that looks at that information and uses it to do occasional event purges. We probably should also use the RAF technique in this case so as to not impact UI performance.

# 2022-03-11

Starting implementation of the sync protocol.

There are a lot of similarities to the join protocol when it comes to initialising a local database to store some information that we need to reliably sync to the server, loading that, storing that and init and deinit. Both storages are keyed by document id.

Implemented some of the prerequisites for a sync protocol, can now do the actual transmission and dealing with the the results next.

# 2022-03-16

Unified the synced document storage for the join and sync protocol. Still doesn't feel super good because there is an implicit dependency between the sync protocol and the join protocol on how to update and handle that storage. But it's ok for now.

Also remove the startClock thing from the join protocol response: we already establish the max clock from the events we have in the log and we update the maxclock automatically based on what remote events come in. We only need to get the information from the server on whether it knows us already or not.

TODO: start reworking the server implementation to support the new protocol

# 2022-03-18

Starting to write the syncprotocol integration test I realized it was going to be really tricky doing that in the same manner I wrote the other integration tests.

The sync protocol itself already requires most of dendriform to work and does not have its own API. I would have to introspect all kinds of different services and stores to figure out whether I was having the expected effect.

I am now investigating whether it wouldn't make more sense to write end to end tests instead. The idea being that it would help test the application itself and it could test the sync protocol at the same time.

The current rough idea would be to:

* Write a tiny, easily controllable, http service to serve the bundled example application as static files with no authentication and the simplest possible in memory implementation of the join and sync protocol
* Use Puppeteer (or playwright) to instantiate two browsers and implement the client side tests

I am looking at using deno for implementing the tiny http service (could be fun) and I have no idea yet whether it is feasible to have multiple clients in a test with Puppeteer.

# 2022-03-25

Since I now have a test server I am looking at our behaviour and I think we need even more intelligent communication with the backend. Specifically we need to make sure that when we have a batch to send to the server and the batch is full, that we immediately schedule the next send so that we make sure the server gets our events ASAP.

What we could also consider is doing the query for new events more regularly (that is the synchronize call runs much more frequently) but we only contact the server when we either have new local events to send or when we have X seconds since the last synchronisation.

This would prioritize quickly sending new events and it would back off from the server more when we have nothing to send. It could delay getting new events from other replicas but it would be a bit more quiet.

TODO: implement more regular syncs but only send when you have local events or some other time has passed.

At some point in the future we may consider doing websockets or something to get notifications of new events.

# 2022-03-25

Starting the koa server from a script and then running puppeteer against it seems to work fine. As a next step we could either start writing tests with puppeteer or I look at playwright and its test framework and see if that doesn't make life easier. It also supports multiple browsers: https://playwright.dev/docs/browser-contexts

# 2022-03-30

It didn't seem clear to me whether Playwright would support multiple browser contexts in the same test and I decided tom push forward with Puppeteer a bit.

Puppeteer is a bit too low level for convenient assertions. You need to evaluate code in the page (logical) to extract attributes and values from DOM nodes so you can assert on them. This could get really painful.

Converted the e2e runners and files to `.ts` files since otherwise we can't easily import from our own codebase. Doing this immediately revealed two bugs in the tiny dendriform server implementation that were just typos and that JavaScript just ignored. :facepalm:

# 2022-03-30

I configured visual studio code to organize imports on save with an additional stanza in the TypeScript specific Settings:

```
{
  "[typescript]": {
    "editor.codeActionsOnSave": {
      "source.organizeImports": true
    }
  },
}
```

# 2022-04-08

I finally got E2E tests running after a bunch of trouble with node and ts-node not really getting along when it comes to knowing what a module is.

I extended the growing e2e-utils a bit to have more debug information for failing e2e tests and I am grappling with using Puppeteer for tests.

I get one error in my second test that is intermittent, but seems like a real bug. Need to investigate this (probably by adding debug output?).

I should also write something here about the two findings I made when implementing the first E2E tests. See the NOTE comments in the source code.

# 2022-04-13

Added the `prettier-plugin-organize-imports` prettier plugin to do import organization. I then disabled the built in vscode typescript `source.organizeImports` setting since it was conflicting with prettier. It was organizing and reformatting in a way that prettier didn't agree with and it led to conflicts.

# 2022-04-13

Refactored our approach to updating nodes to avoid a previous error and make it more efficient and robust.

this causes a new test error to investigate:

```
console warning: Test failure in After a remote update our own clock is higher than the remote update clock , cause: TypeError: Cannot read properties of undefined (reading 'id')
    at copyNode (file:///home/boris/dev/projects/dendriform/dendriform-client/dist/integration-tests.js:3176:14)
    at MoveOpTree.updateLocalNode (file:///home/boris/dev/projects/dendriform/dendriform-client/dist/integration-tests.js:3003:21)
    at async file:///home/boris/dev/projects/dendriform/dendriform-client/dist/integration-tests.js:3518:3
    at async Object.fn (file:///home/boris/dev/projects/dendriform/dendriform-client/dist/integration-tests.js:3412:7)
    at async run (file:///home/boris/dev/projects/dendriform/dendriform-client/dist/integration-tests.js:1819:7)
    at async file:///home/boris/dev/projects/dendriform/dendriform-client/dist/integration-tests.js:3609:3
```

# 2022-04-20

Integration tests are not properly failing or indicating that they are failing when an error is detected. I really need to clean that runner up.

I had a look at our various tests and even when the integration tests and the E2E tests use Puppeteer, they are completely different kinds of tests and it is ok to have different infrastructure for them:

* Integration tests are just normal headless tests that have to run in the browser to have access to certain subsystems like IndexedDb
* E2E tests are assertions on existing webpages where we use Pupetteer "just" to have a headless browser

There could be a tiny shared library of Puppeteer helpers, but in general they are two different approaches.

Some things I need to do:
* Create a Browser Reporter for Tizzy that can properly report test progress with events and which we can output nicely on the console.
* Clean up error handling (all cases, errors in tests, timeouts, browser errors)
* Come up with some sort of runner/progress for the E2E tests. Also do some tizzy integration?

Next up is writing more tests, especially multi-client tests.

TODO: implement offline badge on main screen

# 2022-04-29

TODO: investigate failing of first concurrent test. It looks like events are not being synced over.

  -> concretely add debug output to trace the path back

# 2022-05-06

There is a big caching + async problem: we have a cache of the parent-child structure inside of idb-treestorage. This cache speeds up two checks: whether a node is known at all and getting the children of a node.

The problem is that querying and updating the cache is interleaved with a bunch of Indexeddb async operations. This means that client side DOM operations are being triggered at a good clip, and some of those operations will be scheduled async for certain portions of their operations (like say storing a new node) and newer operations that assume these nodes exist will query the cache for them and find that they do not yet exist.

We could solve this (perhaps) in two ways:
- Either insert a queue and make sure all actions and commands are executed sequentially. This would severly reduce throughput I think.
- Remove the cache and do everything directly on indexeddb. This would slowdown two calls (isNodeKnown and getChildIds) but if we assume that indexeddb serializes updates, we would be consistent again. Since these queries are happening async anyway, the performance hint may not be noticeable by the client.

I would tend to the latter. The only worry I is the loadTreeRecursive call in repository-logandtreestorage where we do use the getChildIds to retrieve a tree with some performance. On the other hand this call is doing individual node loads anyway, perhaps we can use an index and get all the children of a node in bulk and even gain performance?

## 2022-05-11

Tests now seem to run, we are failing at the end because the E2E test does not terminate normally.

We made sure that the client side syncing now has no overlapping sync requests to prevent data inconcistencies and we fixed the tiny server implementation to correctly deal with client side replicasets.

TODO: What is left now is to verify whether we are confident that the caching problem is now mitigated, or whether we need to do more. Specifically we need to trace the path of local node updates and verify that when we do local operations in quick succession, the database reads and writes are sequential.

# 2022-05-18

Was finally able to fix my test reporting a bit and am finding out I have an error in the integration tests.

This also seems a plausible error: it tests whether we can receive remote events out of order and apply them by storing them if we are not ready to process them and by replaying them when we get new older events.

In this particular case we assert that the parent node must be known when storing the child node. This is of course correct and I think we had an explicit check for this before. So we need to store the moveOp and then when the preconditions are not met, just silently exit and not persist the change.

# 2022-06-15

I fixed the isAncestorOf check, which was completely wrong and got rid of a bunch of inexplicable test errors.

Turns out ceylon (the assertion library I use) says that an object that is Puppeteer node handle does not exist when asserting it. Even if it is actually an instance.

# 2022-06-16

I traced down a bug where nodes were being renamed to the right letters in the wrong order. E.g. instead of 'Bar' we got 'arB'. But not always.

I was able to trace this back to how we handle Commands in `tree-component.ts`: in performWithDom we were executing the command in the dom, then the backend and then optionally rerendering the tree. If the command was specifying an "after focus node" then we would refocus the cursor _after_ all the above operations are done.

In reality this means that as keyboard events come in, they all trigger commands to be executed and when a long running command suddenly returns and requires a DOM operation like focusing the node, this will basically intervleave with other commands that were triggered afterwards. 

In our concrete case this manifested with an 'Enter' keypress from a split command interleaving with a few following letter presses that came after it. This caused the cursor to jump forward and to insert the new characters before the existing string.

This is now fixed for commands that do _not_ require a rerender of the tree. For commands that _do_ rerender the tree, we still execute the focus command after that rerender. I assume that can still cause really weird effects, especially if we test it in a unit test that types really fast.

Maybe the solution in these cases is to make sure that we block user input for as long as the rerender requiring operation runs. Not sure yet how to technically solve that.

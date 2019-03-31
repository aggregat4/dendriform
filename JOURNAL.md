# Journal

## Sometime in 2017

### Promises are tricky

* It is imperative that what is passed to a then() call is actually a function a not just a call to a function that returns a promise. In hindsight this is obvious, but debugging this is nasty.

### Updates need to be serialized

The delayed updates of the rename action (typing a character renames the node) are causing issues: when a rename is debounced and delayed for 250 milliseconds, and you split the same node inside of that window, the node is split and suddenly you have 2 nodes called the same text when the rename finally happens.

We need to debounce to not overload pouchdb, but we can't let the split happen before the rename.

Does this mean we need to serialize updates ourselves? Put all Update commands (without debouncing) in a queue and process that? When do we rerender the tree?

### Virtual DOM Issues

We have a problem with our current model: since we use a virtual dom approach we need to rely on that to reflect changes in our model. Currently the model is always loaded from pouchdb, that is "the truth". This has the disadvantage that (async) updates in pouchdb need to happen before we can render the changes in the state. This in turn causes delays, and even adds a need for debouncing when operations are very quick and pouchdb does not keep up. This makes the application feel unncessarily slow.

There are two ways around this that I see:

* Separate model: Keep the vdom approach and modify an in memory representation of the tree, serialize all updates to pouchdb and have those happen in the background. Problems here are that we need to store _another_ representation of the tree, and we need a way to deal with async updates coming in through pouchdb from other devices: when do we completely reload the local representation?

* Pure DOM approach: Restart the view layer without maquette, go pure dom, try to use [RE:DOM](https://redom.js.org/) perhaps. We could do all local changes directly on the DOM and serialize updates in the background to pouchdb. Here too we need to deal with the background sync issues and how to merge them in.

The two models are more similar then I imagined: they both operate on a local representation of the tree, which in both cases can be partial (think about collapsed nodes) and with both approaches I need to serialize updates to the backing store.

So, current idea: start a new branch where we will implement synchronous commands that operate on the DOM tree and queue all backend repository updates in a serialized queue with pouchdb updates.

Ideas:

* Implement everyhting with getElementById, optionally I could try to optimise to always pass the current node as well since I usually have that, this could obviate a lookup with certain operations.

* A load is a load: always load from backing store and rerender tree. We just need to stop rerendering for everything since we will be (hopefully) in sync

* We should be able to reuse the current pouchdb commands, need to abstract those builders out as an interface and have two implementations?

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

* Does it have an internal cache of the tree for rerendering purposes? If so, where and how is it managed? Does it get it from the UndoableTreeService?

* I'm a bit flummoxed by the exec() in tree-component and am wondering where the focus information there should be coming from. Perhaps I need to review the master branch to see where this was.

## 23.2.2018

I got everything more or less wired up, all compile errors gone and was testing the new tree. Turns out the inmemory nodes after splitting were not appearing. Turns out our in memory repository was working with ResolvedRepositoryNodes and if we add a new child to a normal RepositoryNode its childrefs were updated, but not the actual list of ResolvedRepositoryNode children. Now I'm refactoring the inmemory repo to use just RepositoryNodes and then construct ResolvedRespositoryNodes at the last possible moment. Basically only when loading the tree. Now of course this will make loading way slower since we need to construct every time and it may turn out this may kill us in the perf department again.
I have a feeling that I will have to move towards direct DOM rendering in the end, keep the state in the dom, as well as in the repos, and then this whole in memory thing will probably have been for naught. Oh well.

## 28.2.2018

Started new branch called direct-dom and trying to redo rendering with RE:DOM. Basic minimal component works, need to load a real tree from Repo and see how we update the component. Two steps:

* update just the one root node first (this involves changing the state as well), then updating the child

* add a List component to the node so we can update children

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

* index each node during rendering with LUNR: {name, description, nodeid, [all ancestor ids]}

### At search time

* debounced search term trigger

* search LUNR index with prefix search, retrieve ALL results

* build a map (a node inclusion map):
    nodeid -> {name_highlight_pos: [], desc_highlight_pos: []}

* rerender (no reload!) tree with this map as a filter + highlight as you go

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

But first we need to solve the ordering question: how and where do we track it? Is this another CRDT? Another Eventlog where the node concerned is the parent node and the events represent the sequence operations on its children? Is this an LSEQ?  Logoot? (<https://hal.inria.fr/inria-00432368/document>)

We probably need another custom approach here, a separate eventlog, queryable by parent node id, containing events of the nature insert(nodeid, afternodeid). We need a similar strategy to resolve concurrent updates  (same afternodeid) by sorting by peerid. Can we have events that have the same afternodeid from the same peer that are concurrent? No, since we always increase the vector clock.

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

My build is a bit fucked, watch no longer watches src/*.

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

* A peer always knows all of his own events. This means that if a peer's storage is ever reset, it needs to act like a new peer and start from scratch.

* A peer always has a consistent state regarding the events from other peers he already saw from the server. Concreteley this means that we always have a valid counter from the server reflecting the current state of events that we have read. Again, if we reset the client somehow, we just become a new peer and fetch all of the events.

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

* The client subscribes to the repository for events concerning nodes that are children of the current root node. This should be fast since we have an in memory map of the tree. This subscription must be remade every time the client loads a different root node.
* When a change was detected, the client rerenders the subtree of each node that was involved, a best effort is made to restore cursor position.

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

* Do it the REDOM way as I understand it: this means that an change event on the dom results in a change in the complete tree and then I just trigger a tree.update. The problem with that is that I would need to reconstruct the entire tree every time a change happens or I need to keep the tree around. And then I am almost in the same place I was with maquette, right?

* Remove REDOM entirely and do the renders and node updates based on remote events completely myself.

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

* IF click on trigger element AND dialog not already shown AND not same trigger
* THEN put dialog in right location of dom tree (needed?), make dialog visible, set aria-expanded on trigger

* IF click on document AND dialog is showing AND not clicked on trigger AND (did not click in dialog OR clicked close button)
* THEN dismiss menu: aria-expanded = false, display = none

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

* validation output for the import
* need a separate import button
* the file selection can not stay persistent after import (reset values after import)
* test dynalist OPML
* test large OPML

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

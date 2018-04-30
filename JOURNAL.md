# Journal

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

App Level Transactions for Meteor + Mongo
-----------------------------------------

This package is used to simulate transactions (at the application level) for Mongo.

Although this package aims to improve the overall data integrity of your app, __do not__ use it to write banking applications or anything like that. Seriously, don't.

Note: because this package attempts to implement something similar to a [mongo 2-phase commit](http://docs.mongodb.org/manual/tutorial/perform-two-phase-commits/), it makes more than twice the usual number of db writes, which has server load implications.

A transaction can be a single action (insert, update or remove) on a single document, or a set of different actions across different documents.

An example app is up at [http://transactions.taonova.com/](http://transactions.taonova.com). [Github repo](https://github.com/JackAdams/transactions-example) for the example app.

#### Quick Start

	meteor add babrahams:transactions

The package exposes an object called `tx` which has all the methods you need to get transactions going.

You can make writes using an options hash with `{tx: true}` in it, as shown below, to make them part of a transaction (note that `upsert` is not supported):

Instead of:

	Posts.insert({text: "My post"});

write:

	Posts.insert({text: "My post"}, {tx: true});
	
Instead of:

	Posts.update({_id: post_id}, {$set: {text: "My improved post"}});

write:

	Posts.update({_id: post_id}, {$set: {text: "My improved post"}}, {tx: true});

Instead of:

	Posts.remove({_id: post_id});

write:

	Posts.remove({_id: post_id}, {tx: true});

#### Writes to multiple documents in a single transaction

The examples above will automatically start a transaction and automatically commit the transaction.

If you want a transaction that encompasses actions on several documents, you need to explictly start and commit the transaction:

	tx.start("delete post");
	Posts.remove({_id: post_id}, {tx: true});
	Comments.find({post_id: post_id}).forEach(function (comment) {
	  Comments.remove({_id: comment._id}, {tx: true});
	});
	tx.commit();

Note that each comment has to be removed independently. Transactions don't support `{multi: true}`.

#### Things it's helpful to know

1. Although those look like mongo selectors in the `Posts.update` and `Posts.remove` examples above, they're really not. This package is only looking for an `_id` field in the object passed as the first parameter -- no other fields in the object are taken into account.

2. Logging is on by default. It's quite handy for debugging. You can turn if off by setting `tx.logging = false;`. Messages are logged to the console by default -- if you want to handle the logging yourself, you can overwrite `tx.log` as follows:

		tx.log = function (message) { 
		  // Your own logging logic here
		}

3. To run all actions through your own custom permission check, write a function as follows:

		tx.checkPermission = function (action, collection, doc, modifier) {
		  // Your permission check logic here
		};
	
	The parameters your function receives are as follows:
	- `action` will be a string - either "insert", "update" or "remove"
	- `collection` will be the actual Meteor collection instance - you can query it if you need to
	- `doc` will be the document in question
	- `modifier` will be the modifier used for an update action (this will be `null` for "insert" or "remove" actions)
	
	If your `tx.checkPermission` function returns a falsey value, the current transaction will be cancelled and rolled back. __Make sure you overwrite `tx.checkPermission` in a production app -- it is completely permissive by default__.

#### What does it do?

**It's important to understand the following points before deciding whether `babrahams:transactions` will be the right package for your app:**

1. It creates a collection called `transactions` in mongodb (or whatever you like, if you set `Meteor.settings.transactionsCollection` via a `settings.json` file). The Meteor collection for this is exposed via `tx.Transactions` not just as plain `Transactions`.

2. It queues all the actions you've called in a single `tx.start() ... tx.commit()` block, doing permission checks as it goes. If a forbidden action (i.e. where `tx.checkPermission` returns `false`) is added to the queue, it will not execute any of the actions previously queued. It will clear the queue and wait for the next transaction to begin. This queue is created by monkey-patching the `insert`, `update` and `remove` methods of `Mongo.Collection` instances so that these db mutator calls are intercepted and not executed until this package has done its thing (much like `aldeed:collection2`). And, yes, this need for monkey-patching is unfortunate, but it [has to be addressed in Meteor core](https://github.com/meteor/meteor/issues/395).

3. Once permission checking is complete, it executes the actions in the order they were queued. If an error is caught, it will roll back all actions that have been executed so far and will not execute any further actions. The queue will be cleared and it will wait for the next transaction.

4. You can specify a few options in the third parameter of the `tx.insert` and `tx.remove` calls (fourth parameter of `tx.update`). One of these is the "instant" option: `Posts.remove({_id: post._id}, {tx: true, instant: true});`. The effect of this is that the action on the document is taken instantly, not queued for later execution. (If a roll back is later found to be required, the action will be un-done.) This is useful if subsequent updates to other documents (in the same transaction) are based on calculations that require the first document to be changed already (e.g removed from the collection).  For example, in a RPG where a new player gets a few items by default:

		tx.start('add new player');
		var newPlayerId = Players.insert({name: "New player"}, {tx: true, instant: true}); // Instant because we need to use the new _id value returned by Players.insert
		var newPlayerDefaultItems = [
		  {name: "Sword", type: "weapon", attack: 5},
		  {name: "Shield", type: "armor", defence: 4},
		  {name: "Cloak", type: "clothing", warmth: 3}
		];
		_.each(newPlayerDefaultItems,function(item) {
		  item.player_id = newPlayerId;
		  Items.insert(item, {tx: true}); // Doesn't need to be instant as we don't do anything with these new _id values
		});
		tx.commit();

	_Note: the options can also be passed as follows: `Players.insert({name: "New player"}, {tx: {instant: true}});`. This can be used to avoid potential namespace collisions with other packages that use the same options hash, such as `aldeed:collection2`. As soon as an options hash is passed as the value for `tx` (instead of `true`), this package won't consider any other options except those in the hash._

5. a. For single actions within a transaction, you can pass a callback function as the next parameter after the options hash. In rare situations you might find you need to pass your callback function explicitly as `callback` in the options hash. e.g. `Posts.remove({_id: post._id}, {instant: true, callback: function (err, res) { console.log(this, err, res); }});`. __Note:__ if the callback functions fired on individual actions (in either a single-action, auto-committed transaction or a `tx.start() ... tx.commit()` block) make changes to collections, these will __NOT__ be undoable as part of the transaction.

    b. A callback can also be passed as the parameter of the `commit` function, as follows: `tx.commit(function(err, res) { console.log(this, err, res); });`. In the callback: `err` is a `Meteor.Error` when the transaction is unsuccessful (and `res` will be false); if the transaction was successful, `res` takes the value(s) of the new _id for transactions that contain insert operations (a single string if there was one insert or an object with arrays of strings indexed by collection name if there were multiple inserts), or `true` for transactions comprising only updates and removes; `res` will be `false` if the transaction was rolled back; in the callback function context, `this` is an object of the form `{transaction_id: <transaction_id>, writes: <an object containing all inserts, updates and removes>}` (`writes` is not set for unsuccessful transactions). If you want the commit function to actually throw errors, rather than swallow them and pass them to the callback, set `tx.rethrowCommitErrors = true;` (`false` by default); or, for individual transactions, pass `rethrowCommitErrors: true` in the options hash when starting a transaction.

6. Another option is `overridePermissionCheck`: `Posts.remove({_id: post_id}, {tx: true, overridePermissionCheck: true});`. This can be used when your generic `tx.checkPermission` function is a little over-zealous. Be sure to wrap your transaction calls in some other permission check logic if you're going to `overridePermissionCheck`. This option only works on the server, for obvious reasons.

7. If you want to do custom filtering of the `tx.Transactions` collection in some admin view, you'll probably want to record some context for each transaction. A `context` field is added to each transaction record and should be a JSON object. By default, we add `context: {}`, but you can set a custom context in a few different ways. 

   You may set context multiple times within one transaction, using multiple methods. Each time you set context the properties will be added to the context you have set already (using underscore.js "extend" behind the scenes). If you set the same key more than once then **last write wins**.
   
   You can read the current context anytime during a transaction with `context = tx.getContext()`. 
   
   Here's how you can set context:

   1. **When Starting a Transaction** you can set context like this: `tx.start('add comments', {context: {post_id: "dgt234rehe346ijhh"}})`

   2. **Anytime During a Transaction** you may add to context with: 
      1. `tx.setContext({prop: "something"})` - like `underscore.extend()` or `lodash.assign()` [more info](https://lodash.com/docs/4.17.2#assign)
	  
	  And, if you overwrite `tx.lodash`, with `tx.lodash = lodash` (or whatever symbol is exported by a `lodash` package you have installed), you get access to the following two methods to help set context:
	  
      2. `tx.mergeContext({prop: {subvar: "something"})` - like `lodash.merge()` [more info](https://lodash.com/docs/4.17.2#merge)
      3. `tx.setContextPathValue("path.to.subvar": "something")` - like `lodash.set()` [more info](https://lodash.com/docs/4.17.2#set)

   3. **Automatically When Adding an Action** you may override the function `tx.makeContext = function(action, collection, doc, modifier) { ... }` to add to context based on each action. `action` is "update", "remove", etc. `collection` is a reference to the Mongo.Collection, `doc` is the object being modified, and `modifier` is the mongo modifier e.g. `{$set: {foo: "bar"}}`. Remember that **last write wins** if multiple actions happen in the same transaction. 

   4. **Manually When Adding an Action** you can pass `{context: { <Your JSON object for context> }}` into the options parameter when adding an action to the transaction. E.G. `Posts.update({ _id: postId}, {$set:{foo:"bar"}}, { tx: true, context:{ postAuthorName: "Jack Black" })`


8. For individual updates, there is an option to provide a custom inverse operation if the transactions package is not getting it right by default. This is the format that a custom inverse operation would need to take (in the options object of the update call):

		"inverse": {
		  "command": "$set",
		  "data": [
			{
			  "key": "text",
			  "value": "My old post text"
			}
		  ]
		}

	If you want to override the default inverse for a certain update operation, you can supply your own function in the `tx.inverseOperations` hash.  For example, if you wanted to restore the entire current state of an array field after a `$push` or `$addToSet` operation, you could implement it like this:

		tx.inverseOperations.$addToSet = function (collection, existingDoc, updateMap, opt) {
		  var self = this, inverseCommand = '$set', formerValues = {};
		  var _drillDown = function (obj, key) {
		    return Meteor._get.apply(null, [obj].concat(key.split('.')));
		  }
		  _.each(_.keys(updateMap), function (keyName) {
		    var formerVal = _drillDown(existingDoc, keyName);
		     if (typeof formerVal !== 'undefined') {
		       formerValues[keyName] = formerVal;
		     } else {
		       // Reset to empty array. Really should be an $unset but cannot mix inverse actions
		       formerValues[keyName] = [];
		     }
		  })
		  return {command: inverseCommand, data: formerValues};
		};

	Note that supplying a `inverse` options property in an individual update always takes precedence over the functions in `tx.inverseOperations`. 

9. The transaction queue is processed entirely on the server, but can be built on the client __OR__ the server (not both).  You can't mix client-side changes and server-side changes (i.e. Meteor methods) in a single transaction. If the transaction is committed on the client, then an array of actions will be sent to the server via a method for processing. __However__, if you perform actions with `{instant: true}` on the client, these will be sent immediately to the server as regular "insert", "udpate" and "remove" methods, so each action will have to get through your allow and deny rules. This means that your `tx.permissionCheck` function will need to be aligned fairly closely to your `allow` and `deny` rules in order to get the expected results. And remember, the `tx.permissionCheck` function is all that stands between transaction code executed on the client and your database.

10. Fields are added to documents that are affected by transactions. `transaction_id` is added to any document that is inserted, updated or soft-deleted via a transaction. This package takes care of updating your schema to allow for this if you are using the `aldeed:collection2` package.

11. The default setting is `tx.softDelete = false`, meaning documents that are removed are taken out of their own collection and stored in a document in the `transactions` collection. This default can be changed at run time by setting `tx.softDelete = true`. Or, for finer grained management, the `softDelete: true` option can be passed on individual `remove` calls. If `softDelete` is `true`, `deleted: <mongo ISO date object>` will be added to the removed document, and then this `deleted` field is `$unset` when the action is undone. This means that the `find` and `findOne` calls in your Meteor method calls and publications will need `,deleted: {$exists: false}` in the selector in order to keep deleted documents away from the client, if that's what you want. This is, admittedly, a pain having to handle the check on the `deleted` field yourself, but it's less prone to error than having a document gone from the database and sitting in a stale state in the `transactions` collection where it won't be updated by migrations, etc. For this reason, we recommend setting `tx.softDelete = true` and dealing with the pain.

    __Note:__ When doing a remove on the client using a transaction with `softDelete` set to `false` and `{instant: true}`, only the _published_ fields of the document are stored for retrieval.  So if a document with only some of its fields published is removed on the client and then that is undone, there will be data loss (the unpublished fields will be gone from the db) which could cause your app to break or behave strangely, depending on how those fields were used.  To prevent this, there are three options:

	-	use `softDelete: true` (then you'll have to change your selectors in `find` and `findOne` everywhere to include `, deleted: {$exists: false}`)
	-	publish the whole document to the client
	-	_[best option]_ use a method call and put the remove transaction call in that, so it executes server-side where it has access to the whole document

12. This is all "last write wins". No Operational Transform going on here. Using `tx.undo`, if a document has been modified by a different transaction than the one you are trying to undo, the undo operation will be cancelled. If users are simultaneously writing to the same sets of documents via transactions, a scenario could potentially arise in which neither user was able to undo their last transaction. This package will not work well for multiple writes to the same document by different users - e.g. Etherpad type apps.

13. Under the hood, all it's doing is putting a document in the `transactions` mongodb collection, one per transaction, that records: a list of which actions were taken on which documents in which collection and then, alongside each of those, the inverse action required for an `undo` and the state of the action (`pending`, `done` or `undone`).

14. The only `update` commands we currently support are `$set`, `$unset`, `$addToSet`, `$pull`, `$push` and `$inc`. We've got a great amount of mileage out of them so far (see below).

15. There is built-in support for the popular `aldeed:collection2` package, but this is a failry volatile combination, as both packages wrap the `insert` and `update` methods on `Mongo.Collection` and both remove any options hash* before passing the call on to the native functions (while still allowing any callbacks to fire, to match the behaviour specified in the Meteor docs).  Open an issue if this package doesn't seem to work with `aldeed:collection2`.

    \* although `babrahams:transactions` does allow the `aldeed:collection2` options through if it detects the presence of that package

16. When starting a transaction, you can write `var txid = tx.start('add post');` and then target this particular transaction for undo/redo using `tx.undo(txid)`. You can also pass a callback instead of (or in addition to) a txid value, as follows:

        tx.undo(function (err, res) {
          // `res` will be true if the transaction was undone or false if it is an expired transaction
	      // `this` will be the tx object 
        }

17. By default, the package will look for any incomplete transactions on app startup and try to repair app state by completing them. This behaviour can be changed by setting `tx.selfRepairMode = 'rollback'` if you'd rather incomplete transactions be rolled back, or `tx.selfRepairMode = 'none'` if you want to handle app state repair manually. (Default is `tx.selfRepairMode = 'complete'`.) 

    Note: to try a repair from `meteor shell`, use `tx._repairAllIncomplete(mode)` or, for individual transactions, `tx._repairIncomplete(transactionDoc, mode)` (where mode is `"complete"` or `"rollback"` and `transactionDoc` is a document from the `tx.Transactions` collection.

18. Monkey patching of the `Mongo.Collection` object is becoming a problem in Meteor and this package uses `dburles:mongo-collection-instances`, which monkey patches the `Mongo.Collection` object for developer convenience (but in doing so adds to the overall problem of interoperability). This means this package will not work well with other packages that do the same thing (there are many!).

19. You may not want all collections to be available for transactions, in which case you can set `tx.collectionIndex` manually in a file that is common to client and server. E.g.

```
tx.collectionIndex = {
  'posts' : Posts,
  'comments' : Comments
}
```
where `'posts'` is the name of the Mongo collection and `Posts` is the Meteor `Mongo.Collection` instance variable.

20. Set `tx.forceCommitBeforeStart = true;` (`false` by default) on client and/or server as a means of strictly keeping the app in a good state (at the cost of potentially messy data if there are bugs in the app). What it means is that any time a transaction is started with a `tx.start( ... )` call, it will force a commit of any open transaction first. To set this on a per-transaction basis, write `tx.start('new transaction', {forceCommitBeforeStart: true})`.

21. If a transaction is idle for a set amount of time (milliseconds), it automatically gets rolled back. To change the default, set `tx.idleTimeout = 2000;` (default is 5000 ms).

#### Production ready?

We've been using this package in a complex production app for almost four years and it's never given us any trouble. That said, we have a fairly small user base and those users perform writes infrequently, so concurrent writes to the same document are unlikely.

#### Roadmap

* [x] __0.3__ - ~~Add callbacks to `tx.commit()`~~
* [x] __0.4__ -~~Remove the need for `tx.collectionIndex`, using `dburles:mongo-collection-instances` package~~
* [x] __0.4.5__ - ~~Add support for `simple-schema`~~
* [x] __0.5__ - ~~Wrap `Mongo.Collection` `insert`, `update` and `remove` methods to create less of an all-or-nothing API~~
* [x] __0.6__ - ~~Store removed documents in the transaction document itself and actually remove them from collections as a default behaviour (`softDelete:true` can be passed to set the deleted field instead)~~
* [x] __0.7__ - ~~Implement something like [the mongo two-phase commit approach](http://docs.mongodb.org/manual/tutorial/perform-two-phase-commits/) (see [issue #5](https://github.com/JackAdams/meteor-transactions/issues/5)) and factor out undo/redo UI to a separate package~~
* [x] __0.8__ ~~- Add more test coverage and refactor code for better maintainability~~
* [ ] __0.9__ - Add/improve support for other/existing mongo operators  
* [ ] __1.0__ - Sufficient test coverage and security audit  
* [ ] __1.0+__ - _Operational Transform_
* [ ] __1.0+__ - _Look into support for {multi:true}_

As you can see from the roadmap, there are still some key things missing from this package. I currently use it in a production app, but it's very much a case of _use-at-your-own-risk_ right now.

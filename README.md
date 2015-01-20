Undo/Redo for Meteor
--------------------

This package is used to give the end user an infinite undo/redo stack, based on transactions. A transaction can be a single action (insert, update or remove) on a single document, or a set of different actions across different documents.

An example app is up at [http://transactions.meteor.com/](http://transactions.meteor.com)

Repo for the example app is [here](https://github.com/JackAdams/transactions-example).

#### Quick Start

	meteor add babrahams:transactions

The package exposes an object called `tx` which has all the methods you need get an undo/redo stack going.

You can make writes using either of the syntax styles shown below to make them undo/redo-able (note that `upsert` is not supported):

Instead of:

	Posts.insert({text:"My post"});

write: `Posts.insert({text:"My post"},{tx:true});` OR `tx.insert(Posts,{text:"My post"});`
	
Instead of:

	Posts.update({_id:post_id},{$set:{text:"My improved post"}});

write: `Posts.update({_id:post_id},{$set:{text:"My improved post"}},{tx:true});` OR `tx.update(Posts,post_id,{$set:{text:"My improved post"}});`

Instead of:

	Posts.remove({_id:post_id});

write: `Posts.remove({_id:post_id},{tx:true});` OR `tx.remove(Posts,post_id);`

__Note about the second syntax style:__ instead of the `post_id`, you can just throw in the whole `post` document. e.g. `tx.remove(Posts,post)` where `post = {_id:"asjkhd2kg92nsglk2g",text:"My lame post"}`

_We recommend using the first syntax style, as that won't require as much refactoring of your app if you remove the `babrahams:transactions` package (just a global find and replace of `,{tx:true}` as the native `insert` and `remove` methods don't accept an options hash). The second syntax is really just to support older apps and packages that rely on it._

The last thing you'll need to do is include the undo/redo buttons widget in a template:

	{{> undoRedoButtons}}

If it doesn't fit nicely into your app's design, you can write your own widget. The only thing you need to do is have an event handler that fires these calls:

	tx.undo()

and

	tx.redo()

#### Writes to multiple documents in a single transaction

The examples above will automatically start a transaction and automatically commit the transaction.

If you want a transaction that encompasses actions on several documents, you need to explictly start and commit the transaction:

	tx.start("delete post");
	Posts.remove({_id:post_id},{tx:true});
	Comments.find({post_id:post_id}).forEach(function(comment) {
	  Comments.remove({_id:comment._id},{tx:true});
	});
	tx.commit();

Note that each comment has to be removed independently. Transactions don't support `{multi:true}`.
Note also that the argument passed to `tx.start()` is the text that will appear on the undo/redo buttons.

Now this post can be restored, along with all its comments, with one click of the "undo" button. (And then re-removed with a click of the "redo" button.)

#### Things it's helpful to know

1. Logging is on by default. It's quite handy for debugging. You can turn if off by setting `tx.logging = false;`. Messages are logged to the console by default -- if you want to handle the logging yourself, you can overwrite `tx.log` as follows:

		tx.log = function(message) { 
		  // Your own logging logic here
		}

2. To run all actions through your own custom permission check, write a function as follows:

		tx.checkPermission = function(action,collection,doc,modifier) {
		  // Your permission check logic here
		};
	
	The parameters your function receives are as follows: `action` will be a string - either "insert", "update" or "remove", `collection` will be the actual Meteor collection instance - you can query it if you need to, `doc` will be the document in question, and `modifier` will be the modifier used for an update action (this will be `null` for "insert" or "remove" actions). If your `tx.checkPermission` function returns a falsey value, the current transaction will be cancelled and rolled back.

3. The end user only gets (by default) the set of transactions they made from 5 minutes before their last browser refresh. All transactions persist until the next browser refresh, so if a user last refreshed their browser 40 minutes ago, they'll have 45 minutes worth of transactions in their client-side stack. This time can be changed by setting `tx.undoTimeLimit = <number of seconds>`.

#### What does it do?

**It's important to understand the following points before deciding whether transactions will be the right package for your app:**

1. It creates a collection called `transactions` in mongodb. The Meteor collection for this is exposed via `tx.Transactions` not just as plain `Transactions`.

2. It queues all the actions you've called in a single `tx.start() ... tx.commit()` block, doing permission checks as it goes. If a forbidden action is added to the queue, it will not execute any of the actions previously queued. It will clear the queue and wait for the next transaction to begin.

3. Once permission checking is complete, it executes the actions in the order they were queued (this is important, see 4.). If an error is caught, it will roll back all actions that have been executed so far and will not execute any further actions. The queue will be cleared and it will wait for the next transaction.

4. You can specify a few options in the third parameter of the `tx.insert` and `tx.remove` calls (fourth parameter of `tx.update`). One of these is the "instant" option: `tx.remove(Posts,post,{instant:true});`. The effect of this is that the action on the document is taken instantly, not queued for later execution. (If a roll back is later found to be required, the action will be un-done.) This is useful if subsequent updates to other documents (in the same transaction) are based on calculations that require the first document to be changed already (e.g removed from the collection).  For example, in a RPG where a new player gets a few items by default:

		tx.start('add new player');
		var newPlayerId = Players.insert({name:"New player"},{tx:true,instant:true}); // We need to use the new _id value returned by Players.insert
		var newPlayerDefaultItems = [
		  {name:"Sword",type:"weapon",attack:5},
		  {name:"Shield",type:"armor",defence:4},
		  {name:"Cloak",type:"clothing",warmth:3}
		];
		_.each(newPlayerDefaultItems,function(item) {
		  item.player_id = newPlayerId;
		  Items.insert(item,{tx:true}); // Doesn't need to be instant as we don't do anything with these new _id values
		});
		tx.commit();

	_Note: the options can also be passed as follows: `Players.insert({name:"New player"},{tx:{instant:true}});`. This can be used to avoid potential namespace collisions with other packages that use the same options hash, such as `aldeed:collection2`. As soon as an option hash is passed as the value for `tx` (instead of `true`), the transaction method won't consider any other options except those in that hash._

5. a. For single actions within a transaction, you can pass a callback function instead of the options hash or, if you want some options _and_ a callback, as the parameter after the options hash. In rare situations you might find you need to pass your callback function explicitly as `callback` in the options hash. e.g. `tx.remove(Posts,post,{instant:true,callback:function(err,res) { console.log(this,err,res)}});`. __Note:__ if the callback functions fired on individual actions (in either a single-action, auto-committed transaction or a `tx.start() ... tx.commit()` block) make changes to collections, these will __NOT__ be undoable as part of the transaction.

    b. A callback can also be passed as the parameter of the `commit` function, as follows: `tx.commit(function(err,res) { console.log(this,err,res); });`. In the callback: `err` is a `Meteor.Error` if the transaction was unsuccessful for some reason; `res` takes the value(s) of the new _id for transactions that contain insert operations (a single string if there was one insert or an array of strings if there were multiple inserts), or `true` for transactions comprising only updates and removes if the transaction was successful; `res` will be `false` if the transaction was rolled back; in the callback function context, `this` is an object of the form `{transaction_id: <transaction_id>, writes: <an object containing all inserts, updates and removes>}` (`writes` is not set for unsuccessful transactions).

6. Another option is `overridePermissionCheck`: `tx.remove(Posts,post,{overridePermissionCheck:true});`. This is only useful on a server-side method call (see 9.) and can be used when your `tx.checkPermission` function is a little over-zealous. Be sure to wrap your transaction calls in some other permission check logic if you're going to `overridePermissionCheck` from a Meteor method.

7. If you want to do custom filtering of the `tx.Transactions` collection in some admin view, you'll probably want to record some context for each transaction. A `context` field is added to each transaction record and should be a JSON object. By default, we add `context:{}`, but you can overwrite `tx.makeContext = function(action,collection,doc,modifier) { ... }` to record a context based on each action. If there are multiple documents being processed by a single transaction, the values from the last document in the queue will overwrite values for `context` fields that have already taken a value from a previous document - last write wins. To achieve finer-grained control over context, you can pass `{context:{ <Your JSON object for context> }}` into the options parameter of the first action and then pass `{context:{}}` for the subsequent actions. 

8. For updates, there is an option to provide a custom inverse operation if the transactions package is not getting it right by default. This is the format that a custom inverse operation would need to take (in the options object):

		"inverse": {
		  "command": "$set",
		  "data": [
			{
			  "key": "text",
			  "value": "My old post text"
			}
		  ]
		}

9. The transaction queue is either processed entirely on the client or entirely on the server.  You can't mix client-side calls and server-side calls (i.e. Meteor methods) in a single transaction. If the transaction is processed on the client, then a successfully processed queue will be sent to the server via DDP as a bunch of regular "insert", "udpate" and "remove" methods, so each action will have to get through your allow and deny rules. This means that your `tx.permissionCheck` function will need to be aligned fairly closely to your `allow` and `deny` rules in order to get the expected results. If the transaction is processed entirely on the server (i.e. in a Meteor method call), the `tx.permissionCheck` function is all that stands between the method code and your database, unless you do some other permission checking within the method before executing a transaction.

10. Fields are added to documents that are affected by transactions. `transaction_id` is added to any document that is inserted, updated or soft-deleted via a transaction. This package takes care of updating your schema to allow for this if you are using the `aldeed:collection2` package.

11. The default setting is `tx.softDelete = false`, meaning documents that are removed are taken out of their own collection and stored in a document in the `transactions` collection. This can default can be changed at run time by setting `tx.softDelete = true`. Or, for finer grained management, the `softDelete:true` option can be passed on individual `remove` calls. If `softDelete` is `true`, `deleted:<unix timestamp>` will be added to the removed document, and then this `deleted` field is `$unset` when the action is undone. This means that the `find` and `findOne` calls in your Meteor method calls and publications will need `,deleted:{$exists:false}` in the selector in order to keep deleted documents away from the client, if that's what you want. This is, admittedly, a pain having to handle the check on the `deleted` field yourself, but it's less prone to error than having a document gone from the database and sitting in a stale state in the `transactions` collection where it won't be updated by migrations, etc. For this reason, we recommend setting `tx.softDelete = true` and dealing with the pain.

	__Note:__ When doing a remove on the client using a transaction with `softDelete` set to `false`, only the _published_ fields of the document are stored for retrieval.  So if a document with only some of its fields published is removed on the client and then that is undone, there will be data loss (the unpublished fields will be gone from the db) which could cause your app to break or behave strangely, depending on how those fields were used.  To prevent this, there are three options:

	-	use `softDelete:true` (then you'll have to change your selectors in `find` and `findOne` everywhere to include `,deleted:{$exists:false}`)
	-	publish the whole document to the client
	-	_[best option]_ use a method call and put the remove transaction call in that, so it executes server-side where it has access to the whole document

12. This is all "last write wins". No Operational Transform going on here. If a document has been modified by a different transaction than the one you are trying to undo, the undo will be cancelled (and the user notified via a callback -- which, by default, is an alert -- you can overwrite this with your own function using `tx.onTransactionExpired = function() { ... }`). If users are simultaneously writing to the same sets of documents via transactions, a scenario could potentially arise in which neither user was able to undo their last transaction. This package will not work well for multiple writes to the same document by different users - e.g. Etherpad type apps.

13. Under the hood, all it's doing is putting a document in the `transactions` mongodb collection, one per transaction, that records: a list of which actions were taken on which documents in which collection and then, alongside each of those, the inverse action required for an `undo`.

14. The only `update` commands we currently support are `$set`, `$unset`, `$addToSet`, `$pull` and `$inc`. We've got a great amount of mileage out of these so far (see below).

15. There is rudimentary support for the popular `aldeed:collection2` package, provided `babrahams:transactions` appears __after__ `aldeed:collection2` in the `.packages` file.  This is a pretty volatile combination, as both packages wrap the `insert` and `update` methods on `Mongo.Collection` and both remove any options hash* before passing the call on to the native functions (while still allowing any callbacks to fire, to match the behaviour specified in the Meteor docs).  Open an issue if this package doesn't seem to work with `aldeed:collection2`.

    \* although `babrahams:transactions` does allow the `aldeed:collection2` options through if it detects the presence of that package

#### In production? Really?

We've been using this package in a large, complex, production app for over 18 months now and it's never given us any trouble. That said, we have a fairly small user base and those users perform writes infrequently, so concurrent writes to the same document are unlikely.

The production app is [Standbench](http://www.standbench.com), which provides online curriculum housing and management for schools.

#### Roadmap

~~0.3 Add callbacks to `tx.commit()`~~

~~0.4 Remove the need for `tx.collectionIndex`, using `dburles:mongo-collection-instances` package~~

~~0.4.5 Add support for `simple-schema`~~

~~0.5 Wrap `Mongo.Collection` `insert`, `update` and `remove` methods to create less of an all-or-nothing API~~

~~0.6 Store removed documents in the transaction document itself and actually remove them from collections as a default behaviour (`softDelete:true` can be passed to set the deleted field instead)~~

0.7 Implement [the mongo two-phase commit approach](http://docs.mongodb.org/manual/tutorial/perform-two-phase-commits/) properly (see [issue #5](https://github.com/JackAdams/meteor-transactions/issues/5))

0.8 Add/improve support for other/existing mongo operators and (maybe) change the non-standard way the undo and redo stacks interplay to a more familiar paradigm for users

0.9 Tests  

1.0 Security audit  

_1.0+ Operational Transform_

_1.0+ Look into support for {multi:true}_

As you can see from the roadmap, there are still some key things missing from this package. I currently use it in a production app, but it's very much a case of _use-at-your-own-risk_ right now.
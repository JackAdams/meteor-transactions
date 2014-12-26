Undo/Redo for Meteor
--------------------

This package is used to give the end user an infinite undo/redo stack, based on transactions. A transaction can be a single action (insert, update or remove) on a single document, or a set of different actions across different documents.

An example app is up at [http://transactions.meteor.com/](http://transactions.meteor.com)

Repo for the example app is [here](https://github.com/JackAdams/transactions-example).

#### Quick Start

	meteor add babrahams:transactions

This is not a just-add-it-and-it-magically-works type package (like many great Meteor packages are).  At the moment, there's a custom API to code against (see below).  The package exposes an object called `tx` which has all the methods you need get an undo/redo stack going.

You can make writes using the syntax shown below (the regular methods are shown above each example for comparison):

	// Posts.insert({text:"My post"});
	tx.insert(Posts,{text:"My post"});
	
	// Posts.update({_id:post_id},{$set:{text:"My improved post"}});
	tx.update(Posts,post_id,{$set:{text:"My improved post"}});
	
	// Posts.remove({_id:post_id});
	tx.remove(Posts,post_id);

Note: instead of the post_id, you can just throw in the whole post document. E.g. `tx.remove(Posts,post)` where `post = {_id:"asjkhd2kg92nsglk2g",text:"My lame post"}`

The last thing you'll need to do is include the undo/redo buttons widget:

	{{> undoRedoButtons}}

If it doesn't fit nicely into your app's design, you can write your own widget. The only thing you need to do is have an event handler that fires these calls:

	tx.undo()

and

	tx.redo()

#### Writes to multiple documents in a single transaction

The examples above will automatically start a transaction and automatically commit the transaction.

If you want a transaction that encompasses actions on several documents, you need to explictly start and commit the transaction:

	tx.start("delete post");
	tx.remove(Posts,post_id);
	Comments.find({post_id:post_id}).forEach(function(comment) {
	  tx.remove(Comments,comment); // comment._id would work equally well as the second argument
	});
	tx.commit();

Note that each comment has to be removed independently. Transactions don't support `{multi:true}`.
Note also that the argument passed to `tx.start()` is the text that will appear on the undo/redo buttons.

Now this post can be restored, along with all its comments, with one click of the "undo" button. (And then re-removed with a click of the "redo" button.)

#### Things it's helpful to know

1. Logging is on by default. It's quite handy for debugging. You can turn if off by setting `tx.logging = false;`. Messages are logged to the console by default -- if you want to handle the logging yourself, you can overwrite `tx.log` as follows: `tx.log = function(message) { <Your own logging logic> }`.

2. To run all actions through your own custom permission check, write a function `tx.checkPermission = function(action,collection,doc,modifier) { <Your permission check logic> };`. The parameters your function receives are as follows: `action` will be a string - either "insert", "update" or "remove", `collection` will be the actual Meteor collection object - you can query it if you need to, `doc` will be the document in question, and `modifier` will be the modifier used for an update action (this will be `null` for "insert" or "remove" actions). If your `tx.checkPermission` function returns a falsey value, the current transaction will be cancelled and rolled back.

3. The end user only gets (by default) the set of transactions they made from 5 minutes before their last browser refresh. All transactions persist until the next browser refresh, so if a user last refreshed their browser 40 minutes ago, they'll have 45 minutes worth of transactions in their client-side stack. This time can be changed by setting `tx.undoTimeLimit = <number of seconds>`.

#### What does it do?

**It's important to understand the following points before deciding whether transactions will be the right package for your app:**

1. It creates a collection called `transactions` in mongodb. The Meteor collection for this is exposed via `tx.Transactions` not just as plain `Transactions`.

2. It queues all the actions you've called in a single `tx.start() ... tx.commit()` block, doing permission checks as it goes. If a forbidden action is added to the queue, it will not execute any of the actions previously queued. It will clear the queue and wait for the next transaction to begin.

3. Once permission checking is complete, it executes the actions in the order they were queued (this is important, see 4.). If an error is caught, it will roll back all actions that have been executed so far and will not execute any further actions. The queue will be cleared and it will wait for the next transaction.

4. (a) You can specify a few options in the third parameter of the `tx.insert` and `tx.remove` calls (fourth parameter of `tx.update`). One of these is the "instant" option: `tx.remove(Posts,post,{instant:true});`. The effect of this is that the action on the document is taken instantly, not queued for later execution. (If a roll back is later found to be required, the action will be un-done.) This is useful if subsequent updates to other documents (in the same transaction) are based on calculations that require the first document to be changed already (e.g removed from the collection).

   (b) For single actions that auto-commit, you can pass a callback function instead of the options hash or, if you want some options _and_ a callback, as `callback` in the options hash. E.g. `tx.remove(Posts,post,{instant:true,callback:function(err,res) { console.log(this,err,res)}});`. Note that callbacks are __not__ fired on every action in a `tx.start() ... tx.commit()` block. In this scenario, a single callback can be passed as the parameter of the `commit` function, as follows: `tx.commit(function(err,res) { console.log(this,err,res); });`. In the callback: `err` is a `Meteor.Error` if the transaction was unsuccessful; `res` takes a value of `true` if the transaction was successful and will be falsey if the transaction was rolled back; `this` is an object of the form `{transaction_id:<transaction_id>,writes:<an object containing all inserts, updates and removes>}` (`writes` is not set for unsuccessful transactions).

5. Another option is `overridePermissionCheck`: `tx.remove(Posts,post,{overridePermissionCheck:true});`. This is only useful on a server-side method call (see 8.) and can be used when your `tx.checkPermission` function is a little over-zealous. Be sure to wrap your transaction calls in some other permission check if you're going to `overridePermissionCheck` from a Meteor method.

6. If you want to do custom filtering of the `tx.Transactions` collection in some admin view, you'll probably want to record some context for each transaction. A `context` field is added to each transaction record and should be a JSON object. By default, we add `context:{}`, but you can overwrite `tx.makeContext = function(action,collection,doc,modifier) { ... }` to record a context based on each action. If there are multiple documents being processed by a single transaction, the values from the last document in the queue will overwrite values for `context` fields that have already taken a value from a previous document - last write wins. To achieve finer-grained control over context, you can pass `{context:{ <Your JSON object for context> }}` into the options parameter of the first action and then pass `{context:{}}` for the subsequent actions. 

7. For updates, there is an option to provide a custom inverse operation if the transactions package is not getting it right by default. This is the format that a custom inverse operation would need to take (in the options object):

	`"inverse": {
	  "command": "$set",
	  "data": [
		{
		  "key": "text",
		  "value": "My old post text"
		}
	  ]
	}`

8. The transaction queue is either processed entirely on the client or entirely on the server.  You can't mix client-side calls and server-side calls (i.e. Meteor methods) in a single transaction. If the transaction is processed on the client, then a successfully processed queue will be sent to the server via DDP as a bunch of regular "insert", "udpate" and "remove" methods, so each action will have to get through your allow and deny rules. This means that your `tx.permissionCheck` function will need to be aligned fairly closely to your `allow` and `deny` rules in order to get the expected results. If the transaction is processed entirely on the server (i.e. in a Meteor method call), the `tx.permissionCheck` function is all that stands between the method code and your database, unless you do some other permission checking within the method before executing a transaction.

9. Fields are added to documents that are affected by transactions. `transaction_id` is added to any document that is inserted, updated or deleted via a transaction. `deleted:<unix timestamp>` is added to any removed document, and then this `deleted` field is `$unset` when the action is undone. This means that the `find` and `findOne` calls in your Meteor method calls and publications will need `,deleted:{$exists:false}` in the selector in order to keep deleted documents away from the client, if that's what you want. This is, admittedly, a pain having to handle the check on the `deleted` field yourself.

10. This is all "last write wins". No Operational Transform going on here. If a document has been modified by a different transaction than the one you are trying to undo, the undo will be cancelled (and the user notified via a callback -- which, by default, is an alert -- you can overwrite this with your own function using `tx.onTransactionExpired = function() { ... }`). If users are simultaneously writing to the same sets of documents via transactions, a scenario could potentially arise in which neither user was able to undo their last transaction. This package will not work well for multiple writes to the same document by different users - e.g. Etherpad type apps.

11. Under the hood, all it's doing is putting a document in the `transactions` mongodb collection, one per transaction, that records: a list of which actions were taken on which documents in which collection and then, alongside each of those, the inverse action required for an `undo`.

12. The only `update` commands we currently support are `$set`, `$unset`, `$addToSet`, `$pull` and `$inc`. We've got a great amount of mileage out of these so far (see below).

#### In production? Really?

We've been using this package in a large, complex, production app for over a year now and it's never given us any trouble. That said, we have a fairly small user base and those users perform writes infrequently, so concurrent writes to the same document are unlikely.

The production app is [Standbench](http://www.standbench.com), which provides electronic curriculum housing and management for schools.

#### Roadmap

~~0.3 Add callbacks to `tx.commit()`~~

~~0.4 Remove the need for `tx.collectionIndex`, using `dburles:mongo-collection-instances` package~~  
0.5 Wrap `Mongo.Collection` `insert`, `update` and `remove` methods to create a less all-or-nothing API  
0.6 Add support for `simple-schema`  
0.7 Add/improve support for other/existing mongo operators  
0.8 Implement [the mongo two-phase commit approach](http://docs.mongodb.org/manual/tutorial/perform-two-phase-commits/) properly  
0.9 Tests  
1.0 Security audit  
1.1 Operational Transform

As you can see from the roadmap, there are a lot of things missing from this package. I can't, in all good conscience, recommend using it in production in its current form (even though I myself do).
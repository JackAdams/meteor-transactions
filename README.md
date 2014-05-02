Undo/Redo for Meteor
--------------------

This package is used to give the end user an infinite undo/redo stack, based on transactions. A transaction can be a single action (insert, update or remove) on a single document, or a set of different actions across different documents.

An example app is up at [http://transactions.meteor.com/](http://transactions.meteor.com/).

#### Quick Start

	mrt add transactions

This is not a just-add-it-and-it-magically-works type package (like many great Meteor packages are). Some config is required.  The package exposes an object called `tx` which has all the methods you need get an undo/redo stack going.

In your app, you'll need something like this:

	tx.collectionIndex = {
	  "posts" : Posts,
	  "comments" : Comments
	}

The keys are the mongo collection names as defined in `Posts = new Meteor.Collection("posts")` and the values are the Meteor collections like `Posts`.  The transactions package won't work without `tx.collectionIndex` being defined.  Make sure you define this *after* the Meteor collections have been defined, in a file that is available on both client and server.

For any collection listed in the `tx.collectionIndex` object, you can make writes using the syntax shown below (regular methods shown above each example for comparison):

	Posts.insert({text:"My post"});
	tx.insert(Posts,{text:"My post"});
	
	Posts.update({_id:post_id},{$set:{text:"My improved post"}});
	tx.update(Posts,post_id,{$set:{text:"My improved post"}});
	
	Posts.remove({_id:post_id});
	tx.remove(Posts,post_id);

Note: instead of the post_id, you can just throw in the whole post document. E.g. `tx.remove(Posts,post)` where `post = {_id:"asjkhd2kg92nsglk2g",text:"My lame post"}`

The last thing you'll need to do is include the undo/redo buttons widget:

	{{> undoRedoButton}}

If it doesn't fit nicely into your app's design, you can write your own widget. The only thing you need to do is have an event handler that fires these calls:

	tx.undo()

and

	tx.redo()

#### Writes to multiple documents in a single transaction

The examples above will automatically start a transaction and automatically commit the transaction.

If you want a transaction that encompasses actions on several documents, you need to explictly start and commit the transaction:

	tx.start("delete post");
	tx.remove(Posts,post_id);
	_.each(Comments.find({post_id:post_id}).fetch(),function(comment) {
	  tx.remove(Comments,comment); // comment._id would work equally well as the second argument
	});
	tx.commit();

Note that each comment has to be removed independently. Transactions don't support `{multi:true}`.
Note also that the argument passed to `tx.start()` is the text that will appear on the undo/redo buttons.

Now this post can be restored, along with all its comments, with one click of the "undo" button. (And then re-removed with a click of the "redo" button.)

#### Things it is helpful to know

1. Logging is on by default. You can turn if off by setting `tx.logging = false;`

2. To run all actions through your own custom permission check, write a function `tx.checkPermission(action,collection,doc,modifier) = function() { <Your permission check logic> };`. The parameters your function receives are as follows: "action" will be a string - either "insert", "update" or "remove", "collection" will be the actual Meteor collection object - you can query it if you need to, "doc" will be the document in question, and "modifier" will be the modifier used for an update action (this will be `null` for "insert" or "remove" actions).

#### What does it do?

**It's important to understand the following points before deciding whether transactions will be the right package for your app:**

1. It creates a collection called `transactions` in mongodb. This is exposed via `tx.Transactions` not just as plain `Transactions`.

2. It queues all the actions you list in a single transaction, doing permission checks as it goes. If a forbidden action is queued, it will not execute any of the actions previously queued. It will clear the queue and wait for the next transaction to begin.

3. Once permission checking is complete, it executes the actions in the order they were queued (this is important, see 4.). If an error is caught, it will roll back all actions that have been executed so far and will not execute any further actions. The queue will be cleared and it will wait for the next transaction.

4. You can specify a couple of options in the third parameter of the `tx.insert` and `tx.remove` calls (fourth parameter for `tx.update`). One of these is the "instant" option: `tx.remove(Posts,post,{instant:true});`. The effect of this is that the action on the document is taken instantly, not queued for later. If a roll back is found to be required the action will be un-done. This is useful if subsequent updates to other documents (in the same transaction) are based on calculations that require the first document to be gone from the collection.

5. The other option is "overridePermissionCheck": `tx.remove(Posts,post,{overridePermissionCheck:true});`. This is only useful on a server-side method call (see 6.) and can be used when your `tx.checkPermission` function is a little over-zealous. Be sure to wrap your transaction calls in some other permission check if you're going to `overridePermissionCheck` from a Meteor method.

6. The transaction queue is either processed entirely on the client or entirely on the server.  You can't mix client-side calls and server-side in a single transaction. If the transaction is processed on the client, then a successfully processed queue will be sent to the server via DDP as a bunch of regular "insert", "udpate" and "remove" methods, so each action will have to get through your allow and deny rules. This means that your `tx.permissionCheck` function will need to be aligned fairly closely to your allow and deny rules in order to get the expected results. If the transaction is processed entirely on the server (i.e. in a Meteor method call), the `tx.permissionCheck` function is all that stands between the client and your database, unless you do some other permission checking before executing the method.

7. Fields are added to documents that are affected by transactions. `transaction_id` is added to any document that is inserted, updated or deleted via a transaction. `deleted:1` is added to any removed document and then the `deleted` field is `$unset` when the action is undone. This means that the `find` and `findOne` calls in your Meteor method calls and publications will need `,deleted:{$exists:false}` in the selector in order to keep deleted documents away from the client, if that's what you want. This is a pain having to handle the check on the `deleted` field yourself.

8. This is all "last write wins". No Operational Transform going on here. If a document has been modified by a different transaction than the one you are trying to undo, the undo will be cancelled (and the user notified via a callback -- which, by default, is an alert -- you can overwrite this with your own function using `tx.onTransactionExpired = function() { ... }`). If users are simultaneously writing to the same sets of documents via transactions, a scenario could potentially arise in which neither user was able to undo their last transaction. This package will not work well for multiple writes to the same document by different users - e.g. Etherpad type apps.

#### In production? Really?

We've been using this package in a production app for almost a year now and it's never given us any trouble. That said, we have a fairly small user base and those users perform writes infrequently, so concurrent writes to the same document are unlikely.

The production app is [Standbench](http://www.standbench.com), which does electronic curriculum housing and management for schools.
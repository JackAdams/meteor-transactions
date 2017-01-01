// *******************************
// Transactions for Meteor + Mongo
// v0.8.0
// by Brent Abrahams
// brent_abrahams@yahoo.com
// MIT Licence 2017
// *******************************
  
// This package adds one new mongo collection to your app
// It is exposed to the app via `tx.Transactions`, not via `Transactions`
// In much the same way that we have `Meteor.users` rather than `Users`

Transactions = new Mongo.Collection(Meteor.settings && Meteor.settings.transactionsCollection || "transactions");

if (Meteor.isServer) {
  Transactions.allow({
    insert: function (userId, doc) { return (_.has(doc, "items") || doc.user_id !== userId) ? false : true; },
    update: function (userId, doc, fields, modifier) { 
      if (userId !== doc.user_id) {
        // TODO -- this condition will need to be modified to allow an admin to look through transactions and undo/redo them from the client
        // That said, an admin interface shouldn't really be messing with the transactions collection from the client anyway, so ignoring this for now
        return false;
      }
      else {
        if (tx._validateModifier(modifier, doc._id)) {
          return true;
        }
        else {
          // Transactions.remove({_id:doc._id});
          return false; 
        }
      }
    },
    remove: function (userId, doc) {
      var fullDoc = Transactions.findOne({_id: doc._id});
      return fullDoc && fullDoc.user_id === userId;
    }
  });
}

TransactionManager = function () {
  
  // This is instantiated as `tx` and maintains a map that points to the correct instance of `Transact`
  // It also carries all of the globally configurable parts of the `tx` object, which intances of `Transact` will reference
  // The per-transaction methods that this manager needs to direct to the correct `Transact` instance are:
  // tx.start
  // tx.insert
  // tx.update
  // tx.remove
  // tx.commit
  // tx.cancel
  // tx.rollback
  
  
  // *******************************************************
  // THIS IS THE MAP FROM CONNECTION TO TRANSACTION INSTANCE
  // *******************************************************
  
  this._txMap = {};
  
  // This ensures that the map contains a `Transact` instance for each connection and also for the default (when there is no connection)
  this._instance = function () {
    var instanceKey = 'default';
    var currentInvocation = DDP._CurrentInvocation;
    if (_.isFunction(currentInvocation.get)) {
      var ci = currentInvocation.get();
      if (ci && ci.connection && ci.connection.id) {
        instanceKey = ci.connection.id;
      }
    }
    var instance = this._txMap[instanceKey];
    if (!instance) {
      this._txMap[instanceKey] = new Transact();
      // Let the instance know its own connection_id
      this._txMap[instanceKey]._connectionId = instanceKey;
      instance = this._txMap[instanceKey];
    }
    return instance;
  }
  
  
  // **********************************************************************************************************
  // YOU CAN OPTIONALLY OVERWRITE tx.collectionIndex TO MAKE THE TRANSACTIONS WORK FOR CERTAIN COLLECTIONS ONLY
  // **********************************************************************************************************
  
  // e.g. in a file shared by client and server, write:
  // tx.collectionIndex = {posts:Posts,comments:Comments, etc...}
  // where the key is the name of the database collection (e.g. 'posts') and the value is the actual Meteor Mongo.Collection object (e.g. Posts)
  // by default, all collections are added to tx.collectionIndex on startup in a "Meteor.startup(function (){ Meteor.defer(function () { ..." block
  // so if you are planning to overwrite tx.collectionIndex, you'll also need to wrap your code in "Meteor.startup(function (){ Meteor.defer(function () { ..." block
  // there's no real need to do this for most applications though
  
  this.collectionIndex = {};
  
  
  // ********************************************************************  
  // YOU CAN OPTIONALLY OVERWRITE ANY OF THESE (e.g. tx.logging = false;)
  // ********************************************************************

  // Recommendations about _where_ to overwrite the following attributes/methods are given as [BOTH], [SERVER], or [CLIENT]


  // Turn logging on or off
  // [BOTH]
  
  this.logging = true;
  
  
  // By default, messages are logged to the console
  // [BOTH]
  
  this.log = function () { if (this.logging) { _.each(arguments, function (message) { console.log(message); }) } };
  
  
  // To show the connection in the logging from `Transact` instances, set `tx.showConnection = true;`
  // Useful for debugging
  
  this.showConnection = false;
  
  
  // Because most/many db writes will come through the transaction manager, this is a good place to do some permission checking
  // NOTE: this permission check is the only thing standing between a user and the database if a transaction is committed from a method with no surrounding permission checks of its own
  // NOTE: if you're commiting transactions from the client, you'll definitely need this as writes do not go through your allow and deny rules
  // [BOTH]
  
  this.checkPermission = function (command, collection, doc, modifier) { return true; }; // commands are "insert", "update", "remove"
  
  
  // For the purpose of filtering transactions later, a "context" field is added to each transaction
  // By default, we don't do anything -- the context is empty, but there are probably certain fields in the document that we could record to use for filtering.
  // Remember, if there are multiple document being processed by a single transaction, the values from the last document in the queue will overwrite values for fields that have taken a value from a previous document - last write wins
  // OVERWRITING THIS WITH tx.makeContext = function () { ... } IS STRONGLY RECOMMENDED
  // [BOTH]
  
  this.makeContext = function (command, collection, doc, modifier) { return {}; }; // TODO -- detect routes and add the path to the context automatically (separate, per router, packages)
  
  
  // If requireUser is set to false, any non-logged in user, using the `babrahams:undo-redo` package gets the undo-redo stack of any non-logged-in user
  // For security purposes this should always be set to true in real apps that use the `babrahams:undo-redo` package
  // [BOTH]
  
  this.requireUser = false;
  
  
  // This function is called on the client when the user tries to undo (or redo) a transaction in which some (or all) documents have been altered by a later transaction
  // [CLIENT]
  
  this.onTransactionExpired = function () { alert('Sorry. Other edits have been made, so this action can no longer be reversed.'); };
  
  
  // If app code forgets to close a transaction on the server, it will autoclose after the following number of milliseconds
  // If a transaction is open on the client, it just stays open indefinitely
  // [BOTH]
  
  this.idleTimeout = 5000;
  
  
  // If something goes wrong and a transaction isn't closed it remains open (on the client - TODO - make the client time out the same way the server does)
  // This is also a problem on the server, as a transaction will remain open until the it times out
  // and meanwhile other transactions can't be started and committed
  // The following can be set to true to stop this from happening, but it means you have to be strict about coding your logic
  // so that only one transaction is started at any given time
  // [BOTH]
  
  this.forceCommitBeforeStart = false;
  
  
  // By default, documents are hard deleted and a snapshot of the document the moment before deletion is stored for retrieval in the transaction document
  // This is much more prone to causing bugs and weirdness in apps, e.g. if a removed doc is restored after documents it depends on have been removed
  // (and whose removal should normally have caused the restored doc to have also been removed and tagged with the same transaction_id)
  // It's safer to turn softDelete on for complex apps, but having it off makes this package work out of the box better, as the user doesn't have to
  // use `,deleted:{$exists:false}` in their `find` and `findOne` selectors to keep deleted docs out of the result
  // [BOTH]
  
  this.softDelete = false;
  
  
  // This flag tells the package how to deal with incomplete transactions, undos and redos on startup
  // The possible modes are:
  // `complete` - which will try to complete any pending transactions
  // `rollback` - which will try to restore db to state prior to the pending transaction
  // any other value will just leave the db in the state it was left at last shutdown
  // [SERVER]
  
  this.selfRepairMode = 'complete';
  
  
  // If you want to limit the volume of rubbish in the transactions collection
  // you can set `tx.removeRolledBackTransactions = true`
  // It is false by default because having a record in the db helps with debugging
  // [BOTH]
  
  this.removeRolledBackTransactions = false;
  
  
  // Overwrite this with something like `tx.lodash = lodash` if you have a lodash package installed
  // This gives you access to `tx.mergeContext` and `tx.setContextPathValue`
 
  this.lodash = null;
  
  
  // The following function `_inverseUsingSet` is necessary for `inverseOperations`
  // It is not intended to be a part of the public API
  // Default inverse operation that uses $set to restore original state of updated fields
  
  this._inverseUsingSet = function (collection, existingDoc, updateMap, opt) {
    var self = this, inverseCommand = '$set', formerValues = {};
    _.each(_.keys(updateMap), function (keyName) {
      // Given a dot delimited string as a key, and an object, find the value
      var _drillDown = function (obj, key) {
        return Meteor._get.apply(null, [obj].concat(key.split('.')));
        // Previous implementation, which worked fine but was more LOC than necessary
        /*var pieces = key.split('.');
        if (pieces.length > 1) {
          var newObj = obj ? obj[pieces[0]] : {};
          pieces.shift();
          return this._drillDown(newObj,pieces.join('.'));
        }
        else {
          if (obj) {
            return obj[key];
          }
          else {
            return; // undefined    
          }    
        }*/
      }
      var formerVal = _drillDown(existingDoc || {}, keyName);
      if (typeof formerVal !== 'undefined') {
        // Restore former value
        inverseCommand = '$set';
        formerValues[keyName] = formerVal;
      }
      else {
        // Field was already unset, so just $unset it again
        inverseCommand = '$unset';
        formerValues[keyName] = 1;
      }
    });
    return {command: inverseCommand, data: formerValues};
  };
  
  
  // Functions to work out the inverse operation that will reverse a single collection update command.
  // This default implementation attempts to reverse individual array $set and $addToSet operations with
  // corresponding $pull operations, but this may not work in some cases, eg:
  // 1.  if a $addToSet operation does nothing because the value is already in the array, the inverse $pull will remove that value from the array, even though
  //     it was there before the $addToSet action
  // 2.  if a $addToSet operation had a $each qualifier (to add multiple values), the default inverse $pull operation will fail because $each is not suported for $pull operations
  // 
  // You may wish to provide your own implementations that override some of these functions to address these issues if they affect your own application.
  // For example, store the entire state of the array being mutated by a $set / $addToSet or $pull operation, and then restore it using a inverse $set operation.
  // The tx.inverse function is called with the tx object as the `this` data context.
  // [BOTH]
  
  this.inverseOperations = {
    '$set': this._inverseUsingSet,
    '$addToSet': function (collection, existingDoc, updateMap, opt) {
      // Inverse of $addToSet is $pull.
      // TODO -- not really -- if an element is already present, this will pull it
      // out after an undo, leaving the value changed
      // This will not work if $addToSet uses modifiers like $each.
      // In that case, you need to restore state of original array using $set
      return {command: '$pull', data: updateMap};
    },
    '$unset': this._inverseUsingSet,
    '$pull': function (collection, existingDoc, updateMap, opt) {
      // Inverse of $pull is $addToSet.
      // TODO -- same problem as $addToSet above, but in reverse
      return {command: '$addToSet', data: updateMap};
    },
    '$inc': this._inverseUsingSet,
    '$push': function (collection, existingDoc, updateMap, opt) {
      // Inverse of $push is $pull.
      // This will not work if $push uses modifiers like $each, or if pushed value has duplicates in same array (because $pull will remove all instances of that value).
      // In that case, you need to restore state of original array using $set
      return {command: '$pull', data: updateMap};
    },
  };
  
  
  // ******************************************************************************************************
  // THESE ARE METHODS EXTERNAL TO THE PACKAGE THAT ARE CALLED OUTSIDE THE CONTEXT OF A `Transact` INSTANCE
  // ******************************************************************************************************
  
  this.apiFunctions = [
    'start',
    'insert',
    'update',
    'remove',
    'cancel',
    'commit',
    'rollback',
    'purgeIncomplete',
    'undo',
    'redo',
    'setContext',
    'mergeContext',
    'setContextPathValue',
    'getContext',
    'transactionStarted'
  ]
  
  // *****************************************************************************************************
  // THESE ARE METHODS INTERNAL TO THE PACKAGE BUT ARE CALLED OUTSIDE THE CONTEXT OF A `Transact` INSTANCE
  // *****************************************************************************************************
  
  this.internalFunctions = [
    '_validateModifier',
    '_repairAllIncomplete',
    '_userOrNull',
    '_processTransaction',
    '_checkTransactionFields',
    '_unpackageForUpdate',
    '_changeItemState',
    '_repairIncomplete'
  ];
  
  var self = this;
  _.each(this.apiFunctions.concat(this.internalFunctions), function (fnName) {
    self[fnName] = function () {
      var instance = self._instance();
      return instance[fnName].apply(instance, arguments);
    }
  });

}


// ******************************
// Instantiation of the tx object
// ******************************

// This (tx) is the object that gets exported for the app to interact with

if (typeof tx === 'undefined') {
  tx = new TransactionManager();
  tx.Transactions = Transactions; // Expose the Transactions collection via tx
}
else {
  throw new Meteor.Error('`tx` is already defined in the global scope. The babrahams:transactions package won\'t work.');  
}

// On the server, instances of `Transact` need to be deleted when the connection closes
// Keep an eye on server memory -- this may not be enough to prevent a memory leak
// , in which case we can take stronger action
if (Meteor.isServer) {
  Meteor.onConnection(function (connection) {
    if (connection.id) {
      connection.onClose(function () {
        delete tx._txMap[connection.id];
      });
    }
  });
}

Transact = function () {

  // ***************************
  // DONT OVERWRITE ANY OF THESE
  // ***************************
  
  // These are transient per-transaction properties that are used internally by the `Transact` instance that is created for the given transaction
  
  this._connectionId = null; // Should be immediately overwritten after instantiation
  this._transaction_id = null;
  this._autoTransaction = false;
  this._items = [];
  this._startAttempts = 0;
  this._rollback = false;
  this._rollbackReason = '';
  this._autoCancel = null;
  this._lastTransactionData = null;
  this._context = {};
  this._description = '';

}

// **********
// PUBLIC API
// **********

// Either use these methods together on the client, or use them together on the server, but don't try mixing the two!

/**
 *  Starts a transaction
 */

Transact.prototype.start = function (description, options) {
  if (tx.requireUser && !Meteor.userId()) {
    this.log('User must be logged in to start a transaction.');
    this._cleanReset();
    return;
  }
  this._resetAutoCancel(Meteor.isClient);
  if (!this._transaction_id) {
    
    // Set transaction description 
    if (typeof description === 'undefined') {
      description = 'last action';  
    }
    this._description = description;
    
    // Set any transaction options e.g. context
    if (typeof options === 'object') {
      if ('context' in options) {
        this._setContext(options['context']);
      }
    }
    
    this._transaction_id = Random.id(); // Transactions.insert({user_id:Meteor.userId(),timestamp:(ServerTime.date()).getTime(),description:description});
    this.log('Started "' + description + '" with transaction_id: ' + this._transaction_id + ((this._autoTransaction) ? ' (auto started)' : ''));
    return this._transaction_id;
  }
  else {
    this.log('An attempt to start a transaction ("' + description + '") was made when a transaction was already open. Open transaction_id: ' + this._transaction_id);
    if ((tx.forceCommitBeforeStart && !(options && (options.useExistingTransaction || options.forceCommitBeforeStart === false))) || (options && options.forceCommitBeforeStart)) {
      // null parameter to force the commit
      // last parameter starts a new transaction after the commit
      tx.commit(null, undefined, undefined, {description: description, options: options});
    }
    else {
      this._startAttempts++;
      if (!(options && options.useExistingTransaction)) {
        return false;
      }
      else {
        this.log('Using existing transaction');
        return this._transaction_id;  
      }
    }
  }
}

/**
 *  Checks whether a transaction is already started
 */

Transact.prototype.transactionStarted = function () {
  return this._transaction_id || null;
}

/**
 * Commits all the changes (actions) queued in the current transaction
 */

Transact.prototype.commit = function (txid, callback, newId, startNewTransaction) {
  var self = this;
  if (tx.requireUser && !Meteor.userId()) {
    self.log('User must be logged in to commit a transaction.');
    this._callback(txid, callback, new Meteor.Error('user-required','No user logged in.'), false);
    return;
  }
  this._lastTransactionData = {};
  this._lastTransactionData.transaction_id = this._transaction_id;
  if (!this._transaction_id) {
    this._cleanReset();
    self.log("Commit reset transaction to clean state");
    this._callback(txid, callback, new Meteor.Error('no-transactions-open', 'No transaction open.'), false);
    return;    
  }
  // If a transaction is committed and either null is passed or the exact transaction_id value
  // then we force commit, no matter how many start attempts there have been
  // otherwise, if there are startAttempts recorded (i.e. tried to start a transaction explicitly while another one was open)
  // reduce the number of startAttempts by one, fire the callback with false and return
  if ((_.isString(txid) && txid === this._transaction_id) || txid === null) {
    // Force commit now
    self.log("Forced commit");
  }
  else if (this._startAttempts > 0) {
    this._startAttempts--;
    this._callback(txid, callback, new Meteor.Error('multiple-transactions-open', 'More than one transaction open. Closing one now to leave ' + this._startAttempts + ' transactions open.'), false);
    return; 
  }
  /*if (!_.isFunction(txid) && typeof txid !== 'undefined' && txid !== this._transaction_id && _.isString(txid)) {
    if (txid === null) {
      tx.log("Forced commit");
    }
    else {
      this._startAttempts--;
      this._callback(txid, callback, new Meteor.Error('multiple-transactions-open', 'More than one transaction open. Closing one now to leave ' + this._startAttempts + ' transactions open.'), false);
      return;
    }
  }
  if (this._startAttempts > 0 && !(!_.isFunction(txid) && typeof txid !== 'undefined' && (txid === this._transaction_id || txid === null))) {
    this._startAttempts--;
    this._callback(txid, callback, new Meteor.Error('multiple-transactions-open', 'More than one transaction open. Closing one now to leave ' + this._startAttempts + ' transactions open.'), false);
    return;    
  }*/
  if (_.isEmpty(this._items)) {
    // Don't record the transaction if nothing happened
    // Transactions.remove({_id:this._transaction_id});
    self.log('Empty transaction: ' + this._transaction_id);
  }
  if (this._rollback) {
    // One or more permissions failed or the transaction was cancelled, don't process the execution stack
    var error = this._rollbackReason;
    var errorDescription = '';
    switch (this._rollbackReason) {
      case 'permission-denied' :
        errorDescription = 'One or more permissions were denied, so transaction was rolled back.';
        break;
      case 'transaction-cancelled' :
        errorDescription = 'The transaction was cancelled programatically, so it was rolled back.';
        break;
      default :
        errorDescription = 'An error occurred when processing an action.';
        suppressError = false;
        break;
    }
    this.rollback();
    this._callback(txid, callback, new Meteor.Error(error, errorDescription), false);
    return;
  }
  else {
    self.log('Beginning commit with transaction_id: ' + this._transaction_id);
    var doRollback = function (err) { 
      self.log("Rolling back changes");
      self.rollback();
      self._callback(txid, callback, new Meteor.Error('error', 'An error occurred, so transaction was rolled back.', err), false);    
    }
    try {
      var runCallback = function (res) {
        if (!self._lastTransactionData) {
          self._lastTransactionData = {};    
        }
        self._lastTransactionData.transaction_id = self._transaction_id;
        self._lastTransactionData.writes = res.items;
        var newIds = _.reduce(res.items, function (memo, item) {
          if (item.action === 'insert') {
            if (typeof memo[item.collection] === "undefined") {
              memo[item.collection] = [];  
            }
            memo[item.collection].push(item._id);
          }
          return memo;
        }, {});
        self._cleanReset();
        self.log("Commit reset transaction manager to clean state");
        self._callback(txid, callback, null, newIds || true);
        if (_.isObject(startNewTransaction)) {
          self.start(startNewTransaction.description, startNewTransaction.options);
        }
      }
      // Okay, this is it -- we're really going to process the queue
      // So no need to time out the transaction if the processing takes a while
      // This will be async in the client and syncronous on the server
      if (Meteor.isServer) {
        Meteor.clearTimeout(this._autoCancel);
        var cannotOverridePermissionCheck = false;
        try {
          var result = self._processTransaction(this._transaction_id, this._description, this._items, this._context, cannotOverridePermissionCheck);
        }
        catch (err) {
          // self.log(err);
        }
        if (!result) {
          self._callback(txid, callback, new Meteor.Error('error', 'An error occurred, so transaction was rolled back.'), false);
          return;
        }
        runCallback(result);
      }
      else {
        clearTimeout(this._autoCancel);
        Meteor.call("_meteorTransactionsProcess", this._transaction_id, this._description, this._items, this._context, function (err, res) {
          if (err || !res) {
            if (err) {
              // self.log(err);
            }
            self._callback(txid, callback, new Meteor.Error('error','An error occurred, so transaction was rolled back.', err), false);
            return;
          }
          else {
            // Just in case Meteor.is[SomethingElse] that isn't server but isn't client either
            if (Meteor.isClient) {
              Tracker.flush(); // Not sure about this
            }
            runCallback(res);
          }
        });
      }
      /*Transactions.update({_id:this._transaction_id}, {$set:_.extend({context:this._context}, {items:this._items})});*/
    }
    catch (err) {
      self.log(err);
      doRollback(err);
      return; 
    }
  }
  return true; // A flag that at least the call was made
  // Only the callback from the _meteorTransactionsProcess will really be able to tell us the result of this call
}

/**
 * Allows programmatic call of a rollback
 */

Transact.prototype.rollback = function (rollbackAllDoneItems) {
  // Need to undo all the instant stuff that's been done
  // TODO -- this is pretty half-baked -- we should be checking that actions are actually completed before continuing -- not just watching for errors
  // Eventually, this should be rolled into a single universal function
  // that iterates over the items array and makes db writes
  // TODO -- this should probably be run as a method
  var self = this;
  var items = this._items.reverse();
  var error = false;
  if (Meteor.isClient) {
    // Don't let people mess with this from the client
    // Only the server can call tx.rollback(true);
    rollbackAllDoneItems = false;  
  }
  _.each(items, function (obj, index) {
    if (obj.action === "remove") {
      if ((obj.instant || rollbackAllDoneItems) && obj.state === 'done') {
        try {
          if (obj.doc) {
            // This was removed from the collection, we need to reinsert it
            tx.collectionIndex[obj.collection].insert(obj.doc);
          }
          else {
            // This was soft deleted, we need to remove the deleted field
            tx.collectionIndex[obj.collection].update({_id: obj._id}, {$unset: {deleted: 1, transaction_id: self._transaction_id}});
          }
          self.log('Rolled back remove');
        }
        catch (err) {
          self.log(err);
          error = true;
        }
      }
    }
    if (obj.action === "update") {
      if (((obj.instant || rollbackAllDoneItems) && obj.state === 'done') && typeof obj.inverse !== 'undefined' && obj.inverse.command && obj.inverse.data) {
        var operation = {};
        operation[obj.inverse.command] = self._unpackageForUpdate(obj.inverse.data); // console.log(operation);
        try {  
          tx.collectionIndex[obj.collection].update({_id: obj._id}, operation);
          self.log('Rolled back update');
        }
        catch (err) {
          self.log(err);
          error = true;
        }
      }
    }
    if (obj.action === "insert") {
      if ((obj.instant || rollbackAllDoneItems) && obj.state === 'done') {
        var sel = {_id: obj._id};
        // This transaction_id check is in case the document has been subsequently edited -- in that case, we don't want it removed from the database completely
        sel.transaction_id = self._transaction_id;
        try {
          tx.collectionIndex[obj.collection].remove(sel);
          self.log('Rolled back insert');
        }
        catch (err) {
          self.log(err);
          error = true;
        }
      }
    }
    if (!error) {
      self._changeItemState({
        txid: self._transaction_id,
        index: (items.length - 1) - index, // Because order was reversed for rollback
        state: "rolledBack"
      });
    }
  });
  if (error) {
    self.log("Rollback failed -- you'll need to check your database manually for corrupted records.");
    self.log("Here is a log of the actions that were tried and their inverses:");
    self.log("(it was probably one of the inverse actions that caused the problem here)");
    self.log(EJSON.stringify(items, null, 2));    
  }
  // Server only
  // Client can't change the transactions collection directly anyway
  if (Meteor.isServer) {
    if (tx.removeRolledBackTransactions) {
      if (rollbackAllDoneItems) {
        Transactions.remove({_id: this._transaction_id});
      }
      self.log('Incomplete transaction removed: ' + this._transaction_id);
    }
    else {
      if (!Transactions.findOne({_id: this._transaction_id})) {
        if (this._transaction_id) {
          var transactionRecord = {_id: this._transaction_id, user_id: tx._userOrNull(), description: this._description, items: items, context: this._context, lastModified: ServerTime.date(), state: "rolledBack"};
          Transactions.insert(transactionRecord, function (err, res) {
            if (err) {
              self.log('No database record for transaction:', self._transaction_id);    
            }
          });
        }
      }
      else {
        Transactions.update({_id: this._transaction_id}, {$set: {state: "rolledBack"}});
      }
    }
  }
  self._cleanReset();
  self.log("Rollback reset transaction manager to clean state");
}

/**
 * Queue an insert
 */

Transact.prototype.insert = function (collection, newDoc, opt, callback) {
  if (this._rollback || (tx.requireUser && !Meteor.userId())) {
    return;    
  }
  // We need to pass the options object when we do the actual insert
  // But also need to identify any callback functions
  var callback = (_.isFunction(callback)) ? callback : ((typeof opt !== 'undefined') ? ((_.isFunction(opt)) ? opt : ((_.isFunction(opt.callback)) ? opt.callback : undefined)) : undefined);
  if (opt && _.isObject(opt.tx)) {
    opt = opt.tx;
  }
  opt = (_.isObject(opt)) ? _.omit(opt,'tx') : undefined; // This is in case we're going to pass this options object on to, say, collection2 (tx must be gone or we'll create an infinite loop)
  newDoc = _.clone(newDoc);
  // NOTE: "collection" is the collection object itself, not a string
  if (this._permissionCheckOverridden(opt) || this._permissionCheck("insert", collection, newDoc, {})) {
    var self = this;
    this._openAutoTransaction(opt && opt.description || 'add ' + collection._name.slice(0, - 1));
    self._setContext((opt && opt.context) || tx.makeContext('insert', collection, newDoc, {}));
    if ((typeof opt !== 'undefined' && opt.instant)) { // || this._autoTransaction
      try {
        var newId = newDoc._id || Random.id();
        _.extend(newDoc, {_id: newId, transaction_id: self._transaction_id});
        var newId = self._doInsert(collection, newDoc, opt, callback); // Should give the same newId value as the one we passed
        var item = self._createItem('insert', collection, newId, {doc: newDoc}, true, self._permissionCheckOverridden(opt));
        this._recordTransaction(item);
        self._pushToRecord("insert", collection, newId, {doc: newDoc}, true, self._permissionCheckOverridden(opt)); // true is to mark this as an instant change
        this._closeAutoTransaction(opt, callback, newId);
        self.log("Executed instant insert");
        return newId;
      }
      catch(err) {
        self.log(err);
        self.log("Rollback initiated by instant insert command");
        this._rollback = true;
        this._rollbackReason = 'insert-error';
      }
    }
    var newId = newDoc._id || Random.id();
    // var newId = self._doInsert(collection,_.extend(newDoc,{transaction_id:self._transaction_id}),opt,callback);
    self._pushToRecord("insert", collection, newId, {doc: _.extend(newDoc, {_id: newId, transaction_id: self._transaction_id})}, false, self._permissionCheckOverridden(opt));
    self.log("Pushed insert command to stack: " + this._transaction_id); //  + ' (Auto: ' + this._autoTransaction + ')'
    this._closeAutoTransaction(opt, callback);
    return newId;
  }
  else {
    this._rollback = true;
    this._rollbackReason = 'permission-denied';
    this.log("Insufficient permissions to insert this document into " + collection._name + ':', newDoc); // Permission to insert not granted
    return;    
  }
  
}

/**
 * Queue a remove
 */

Transact.prototype.remove = function (collection, doc, opt, callback) {
  // Remove any document with a field that has this val
  // NOTE: "collection" is the collection object itself, not a string
  if (this._rollback || (tx.requireUser && !Meteor.userId())) {
    return;    
  }
  // We need to pass the options object when we do the actual remove
  // But also need to identify any callback functions
  var callback = (_.isFunction(callback)) ? callback : ((typeof opt !== 'undefined') ? ((_.isFunction(opt)) ? opt : ((_.isFunction(opt.callback)) ? opt.callback : undefined)) : undefined);
  if (opt && _.isObject(opt.tx)) {
    opt = opt.tx;
  }
  var _id = (_.isObject(doc)) ? doc._id : doc;
  var existingDoc = collection.findOne({_id: _id}); // (!_.isObject(doc)) ? collection.findOne({_id: doc}) : doc; // , {transform: null}
  if (!(_id && existingDoc)) {
    this.log('No document found. Make sure you provide an _id field for a document that exists. You passed: ' + JSON.stringify(doc));
  }
  if (this._permissionCheckOverridden(opt) || this._permissionCheck("remove", collection, existingDoc, {})) {
    var self = this;
    this._openAutoTransaction(opt && opt.description || 'remove ' + collection._name.slice(0, - 1));
    var sel = {_id: _id};
    if (Meteor.isServer) {
      sel.deleted = {$exists: false}; // Can only do removes on client using a simple _id selector
    }
    self._setContext((opt && opt.context) || tx.makeContext('remove', collection, existingDoc, {}));
    if (opt && opt.instant) {
      try {
        self._doRemove(collection, _id, sel, true, opt, callback);
        self.log("Executed instant remove");
      }
      catch(err) {
        self.log(err);
        self.log("Rollback initiated by instant remove command");
        this._rollback = true;
        this._rollbackReason = 'remove-error';
      }
    }
    else {
      self._doRemove(collection, _id, sel, false, opt, callback);
      self.log("Pushed remove command to stack: " + this._transaction_id); //  + ' (Auto: ' + this._autoTransaction + ')'
    }
    this._closeAutoTransaction(opt, callback);
    return !this._rollback; // Remove was executed or queued for execution
  }
  else {
    this._rollback = true;
    this._rollbackReason = 'permission-denied';
    this.log("Insufficient permissions to remove this document from " + collection._name + ':', existingDoc); // Permission to remove not granted
    return;
  }
}

/**
 * Queue an update
 */

Transact.prototype.update = function (collection, doc, updates, opt, callback) {
  // NOTE: "field" should be of the form {$set:{field:value}}, etc.
  // NOTE: "collection" is the collection object itself, not a string
  if (this._rollback || (tx.requireUser && !Meteor.userId())) {
    return;    
  }
  // We need to pass the options object when we do the actual update
  // But also need to identify any callback functions
  var callback = (_.isFunction(callback)) ? callback : ((typeof opt !== 'undefined') ? ((_.isFunction(opt)) ? opt : ((_.isFunction(opt.callback)) ? opt.callback : undefined)) : undefined);
  if (opt && _.isObject(opt.tx)) {
    opt = opt.tx;
  }
  var opt = (_.isObject(opt)) ? _.omit(opt,'tx') : undefined;
  var self = this;
  var _id = (_.isObject(doc)) ? doc._id : doc;
  var existingDoc = collection.findOne({_id: _id}); // , {transform: null}
  // var existingDoc = (!_.isObject(doc)) ? collection.findOne({_id:_id}) : doc;
  // the above is slightly more efficient, in that it doesn't hit the database again
  // but potential buggy behaviour if a partial doc is passed and the field being updated
  // isn't in it and it's a $set command and so the inverse is wrongly taken to be $unset
  if (!(_id && existingDoc)) {
    self.log('No document found. Make sure you provide an _id field for a document that exists. You passed: ' + JSON.stringify(doc)); 
  }
  if (this._permissionCheckOverridden(opt) || this._permissionCheck("update", collection, existingDoc, updates)) {
    this._openAutoTransaction(opt && opt.description || 'update ' + collection._name.slice(0, - 1));
    var actionFields = _.pairs(updates); // console.log('actionFields:', actionFields);
    // If the command is $set, the update map needs to be split into individual fields in case some didn't exist before and some did
    // in which case different fields will require different inverse operations
    actionFields = _.reduce(actionFields, function (memo, action) {
      var command = action[0]; // console.log("the command:", command);
      var updateMap = action[1]; // console.log("the map:", updateMap);
      if (command === '$set') {
        actions = _.map(updateMap, function (val, key) {
          var obj = {};
          obj[key] = val;
          return obj;
        }); // console.log("the actions:", actions);
      }
      else {
        actions = [updateMap];  
      }
      _.each(actions, function (update) {
        memo.push([command, update]);
      });
      return memo;
    }, []); // console.log("actionFields:", actionFields);
    var actionFieldsCount = actionFields.length;
    for (var i = 0; i < actionFieldsCount; i++) {
      var command = actionFields[i][0]; // console.log("command:", command);
      var updateMap = actionFields[i][1]; // console.log("updateMap:", updateMap, EJSON.stringify(updateMap));
      var inverse;
      if (typeof opt === 'undefined' || typeof opt.inverse === 'undefined') {
        // var fieldName = _.keys(actionField[0][1])[0]; // console.log(fieldName);
        if (typeof opt === 'undefined') {
          opt = {};    
        }
        // console.log("inverse called with (collection, existingDoc, updateMap, opt):", collection, existingDoc, updateMap, opt);
        inverse = _.isFunction(tx.inverseOperations[command]) && tx.inverseOperations[command].call(self, collection, existingDoc, updateMap, opt) || tx._inverseUsingSet(collection, existingDoc, updateMap, opt);
        // console.log("inverse:", inverse);
      }
      else {
        // This "opt.inverse" thing is only used if you need to define some tricky inverse operation, but will probably not be necessary in practice
        // a custom value of opt.inverse needs to be an object of the form:
        // {command: "$set", data: {fieldName: value}}
        inverse = opt.inverse;    
      }
      // console.log("inverse:", inverse);
      self._setContext((opt && opt.context) || tx.makeContext('update', collection, existingDoc, updates));
      var updateData = {command: command, data: updateMap};
      if (opt && opt.instant) {
        try {      
          self._doUpdate(collection, _id, updates, updateData, inverse, true, opt, callback, (i === (actionFieldsCount - 1)) ? true : false);
          self.log("Executed instant update"); // true param is to record this as an instant change
        }
        catch(err) {
          self.log(err);
          self.log("Rollback initiated by instant update command");
          this._rollback = true;
          this._rollbackReason = 'update-error';
        }
      }
      else {
        (function (updateData, inverse, execute) { // console.log('updateData, inverse, execute:', updateData, inverse, execute);
          self._doUpdate(collection, _id, updates, updateData, inverse, false, opt, callback, execute);
          self.log("Pushed update command to stack: " + this._transaction_id); //  + ' (Auto: ' + this._autoTransaction + ')'
        }).call(this, updateData, inverse, (i === (actionFieldsCount - 1)) ? true : false);
      }
    }
    this._closeAutoTransaction(opt, callback);
    return !this._rollback; // Update was executed or queued for execution
  }
  else {
    this._rollback = true;
    this._rollbackReason = 'permission-denied';
    self.log("Insufficient permissions to update this document in " + collection._name + ':', existingDoc); // Permission to update not granted
    return;
  }
}

/**
 * Cancels a transaction, but doesn't roll back immediately
 * When the transaction is committed, no queued actions will be executed
 * and any instant updates, inserts or removes that were made will be rolled back
 */  

Transact.prototype.cancel = function () {
  this.log('Transaction cancelled');
  this._rollback = true;
  this._rollbackReason = 'transaction-cancelled';
}

/**
 * Undo the last transaction by the user
 */ 

Transact.prototype.undo = function (txid, callback) {
  var self = this;
  var callback = (_.isFunction(txid)) ? txid : callback;
  Meteor.call("_meteorTransactionsUndo", (_.isString(txid)) ? txid : null, function (err, res) {
    if (Meteor.isClient && res && _.isFunction(tx.onTransactionExpired)) {
      tx.onTransactionExpired.call(self, err, res);
    }
    if (_.isFunction(callback)) {
      callback.call(self, err, !res);
    }
  });
}

/**
 * Redo the last transaction undone by the user
 */

Transact.prototype.redo = function (txid, callback) {
  var self = this;
  var callback = (_.isFunction(txid)) ? txid : callback;
  Meteor.call("_meteorTransactionsRedo", (_.isString(txid)) ? txid : null, function (err, res) {
    if (Meteor.isClient && res && _.isFunction(tx.onTransactionExpired)) {
      tx.onTransactionExpired.call();  
    }
    if (_.isFunction(callback)) {
      callback.call(self, err, !res);
    }
  });
}

/**
 * Manually add context to current transaction using _.extend (equivalent of lodash.assign)
 */
 
Transact.prototype.setContext = function (context) {
  this._setContext(context);
}

/**
 * Manually add context to current transaction using lodash.merge
 */

Transact.prototype.mergeContext = function (context) {
  tx.lodash.merge(this._context, context);
}

/**
 * Manually add context to current transaction using lodash.set
 */

Transact.prototype.setContextPathValue = function (path, value) {
  tx.lodash.set(this._context, path, value);
}

/**
 * Fetch context of the current transaction
 */

Transact.prototype.getContext = function (context) {
  return this._context;
}

// **********************************************************
// INTERNAL METHODS - NOT INTENDED TO BE CALLED FROM APP CODE
// **********************************************************

Transact.prototype.log = function (message) {
  tx.log(((tx.showConnection) ? '[Connection: ' + this._connectionId + '] ' : '') + message);    
}

Transact.prototype._doInsert = function (collection, newDoc, opt, callback) {
  // The following is a very sketchy attempt to support collection2 options
  // Requires aldeed:collection2 to be before babrahams:transactions in .packages
  // which we do through a weak dependency on aldeed:collection2
  if (this._Collection2Support(collection, opt)) {
    // This is a brutal workaround to allow collection2 options to do their work
    var newId = null;
    var error = null;
    var returnedId = collection.insert(newDoc, opt, function (err, newId) {
      if (!err) {
        newId = newId;
      }
      else {
        error = err;    
      }
      if (_.isFunction(callback)) { // Let the app handle the error via its own callback
        callback(error, newId);
      }
    });
    if (returnedId) {
      return returnedId;
    }
    else {
      throw new Meteor.Error('Insert failed: reason unknown.', '');  
    }
  }
  else {
    return collection.insert(newDoc, callback);
  }
}

Transact.prototype._doRemove = function (collection, _id, sel, instant, opt, callback) {
  if (!_.isFunction(callback)) {
    callback = undefined;  
  }
  var self = this;
  if ((opt && typeof opt.softDelete !== 'undefined' && opt.softDelete) || (opt && typeof opt.softDelete === 'undefined' && tx.softDelete) || (typeof opt === 'undefined' && tx.softDelete)) {
    self._pushToRecord("remove", collection, _id, null, instant, self._permissionCheckOverridden(opt));
    if (instant) {
      var item = self._createItem("remove", collection, _id, null, instant, self._permissionCheckOverridden(opt));
      self._recordTransaction(item);
      collection.update(sel, {$set: {deleted: ServerTime.date(), transaction_id: self._transaction_id}}, callback);
    }
    return;
  }
  var fields = {hardDelete: true};
  // Hard delete document
  if (instant) {
    var fullDoc = collection.findOne(sel); // , {transform: null}
    fields.doc = fullDoc;
    if (!fullDoc) {
      // There is no existing document to remove
      // Return without creating an item in the queue or recording it
      self.log("Document not found for removal:", sel);
    }
    else {
      fields.doc.transaction_id = self._transaction_id;
      fields.doc.deleted = ServerTime.date();
    }
    var item = self._createItem("remove", collection, _id, fields, instant, self._permissionCheckOverridden(opt));
    self._recordTransaction(item);
    collection.remove(sel, callback);
  }
  self._pushToRecord("remove", collection ,_id, fields, instant, self._permissionCheckOverridden(opt)); // null is for field data (only used for updates) and true is to mark this as an instant change
}

Transact.prototype._doUpdate = function (collection, _id, updates, updateData, inverseData, instant, opt, callback, execute) {
  // console.log("collection, _id, updates, updateData, inverseData, instant, opt, callback, execute", collection, _id, updates, updateData, inverseData, instant, opt, callback, execute);
  var self = this;
  if (instant) {
    if (execute) {
      if (!_.isFunction(callback)) {
        callback = undefined;
      }
      if (_.isObject(updates["$set"])) {
        _.extend(updates["$set"], {transaction_id: self._transaction_id});
      }
      else {
        updates["$set"] = {transaction_id: self._transaction_id};
      }
      // This error, handler business is to allow collection2 `filter:false` to do its work
      var error = null;
      var handler = function (err, res) {
        if (err) {
          error = err;  
        }
        if (_.isFunction(callback)) {
          callback(err, res);
        }
      }
      var item = self._createItem("update", collection, _id, {update: self._packageForStorage(updateData), inverse: self._packageForStorage(inverseData)}, instant,self._permissionCheckOverridden(opt));
      self._recordTransaction(item);
      // No need to check for aldeed:collection2 support (like we do for inserts)
      // as we can pass an options hash to an update
      if (_.isObject(opt)) {
        collection.update({_id:_id}, updates, opt, handler);
      }
      else {
        collection.update({_id:_id}, updates, handler);    
      }
      if (error) {
        throw new Meteor.Error('Update failed: ' + error.message, error.reason);
        return;
      }
      delete updates["$set"].transaction_id;
    }
  }
  // console.log(JSON.stringify({update: self._packageForStorage(updateData)}), JSON.stringify({inverse: self._packageForStorage(inverseData)}));
  self._pushToRecord("update", collection, _id, {update: self._packageForStorage(updateData), inverse: self._packageForStorage(inverseData)}, instant, self._permissionCheckOverridden(opt));
}

// This is used only if an {instant: true} parameter is passed

Transact.prototype._recordTransaction = function (item) {
  if (!Transactions.findOne({_id: this._transaction_id})) {
    // We need to get a real transaction in the database for recoverability purposes
    var user_id = tx._userOrNull();
    Transactions.insert({
      _id: this._transaction_id,
      user_id: user_id,
      lastModified: ServerTime.date(),
      description: this._description,
      context: this._context,
      state: "pending"
    });
  }
  Transactions.update({_id: this._transaction_id}, {$addToSet: {items: item}});
}

// This is used to check that the document going into the transactions collection has all the necessary fields

Transact.prototype._validateModifier = function (modifier, txid) {
  var fields = modifier && modifier["$addToSet"];
  if (!fields) {
   return null;
  }
  return this._checkTransactionFields([fields.items], txid);
}

Transact.prototype._checkTransactionFields = function (items, txid, cannotOverridePermissionCheck) {
  // Iterate over all the items that are going to be stored on the transaction stack and check their legitimacy
  if (!items || !items.length) {
   return false; 
  }
  var self = this, recombinedUpdateFields = {}, recombinedInverseFields = {};
  var action, collection, doc, details, inverseDetails, fail = false, previouslyNonExistingDoc = {};
  _.each(items, function (value) {
    if (!fail) {
      collection = value.collection;
      // Watch out for undo method validation of a remove, where the doc has been hard removed from the collection
      // Allowing a doc through that was passed from the client is a potential security hole here, but without soft delete, there is no actual record of that doc
      // So we check that the removed doc's transaction_id value matches the txid
      if (value.action === 'remove' && value.doc && value.doc.transaction_id === txid) {
         doc = value.doc;
      }
      else if (value.action === 'insert' && value.doc && value.doc.transaction_id === txid) {
        // Handle redo of an insert (after a previous undo)
        doc = value.doc;
        previouslyNonExistingDoc[doc._id] = doc;
      }
      else {
        doc = previouslyNonExistingDoc[value._id] || tx.collectionIndex[collection].findOne({_id: value._id});
      }
      if (Meteor.isClient && !doc) {
        // Because this runs in a client simulation,
        // where a removed document may not be in the collection
        // or we simply may not be subscribed to that doc anymore 
        // we need to consider and watch out for this
        // we'll extend the benefit of the doubt and let the server handle the real check
        return;  
      }
      if (value.action === 'update') {
        action = 'update';
        details = value.update;
        inverseDetails = value.inverse;
        recombinedUpdateFields[details.command] = self._unpackageForUpdate(details.data);
        recombinedInverseFields[inverseDetails.command] = self._unpackageForUpdate(inverseDetails.data);
        if (!(value.noCheck && !cannotOverridePermissionCheck)) {
          // Transactions that have been allowed using overridePermissionCheck are considered here, using the noCheck flag
          // Otherwise the user won't be able to undo them
          try {
            fail = !(self._permissionCheck(action, tx.collectionIndex[collection], doc, recombinedUpdateFields) && self._permissionCheck(action, tx.collectionIndex[collection], doc, recombinedInverseFields));
          }
          catch (err) {
            fail = true;
          }
        }
        return;
      }
      else if (value.action === 'insert') {
        action = 'insert';  
      }
      else if (value.action === 'remove' ) {
        action = 'remove';   
      }
      if (!(value.noCheck && !cannotOverridePermissionCheck)) {
        try {
          fail = !self._permissionCheck(action, tx.collectionIndex[collection], doc, {});
        }
        catch (err) {
          // If this transaction was made possible by overridePermissionCheck
          // It may not be undo/redo-able, unless we follow the same rules (i.e. abide by the noCheck flag)
          fail = true;
        }
      }
    }
  });
  return !fail;
}

// Reset everything to a clean state

Transact.prototype._cleanReset = function () {
  this._transaction_id = null;
  this._autoTransaction = false;
  this._items = [];
  this._startAttempts = 0;
  this._granted = {};
  this._rollback = false;
  this._rollbackReason = '';
  this._context = {};
  this._description = '';
  // Note: we don't reset this._lastTransactionData because we want it to be available AFTER the commit
  Meteor.clearTimeout(this._autoCancel);
}

Transact.prototype._callback = function (a, b, err, res) {
  var c = (_.isFunction(a)) ? a : ((_.isFunction(b)) ? b : null);
  if (c) {
    c.call(this._lastTransactionData, err, res);
  }  
}

// Starts a transaction automatically if one isn't started already

Transact.prototype._openAutoTransaction = function (description) {// console.log("Auto open check value for transaction_id: " + this._transaction_id + ' (Auto: ' + this._autoTransaction + ')');
  if (!this._transaction_id) {
    this._autoTransaction = true;
    this._description = description;
    this.start(description);
    // console.log("Auto opened: " + this._transaction_id + ' (Auto: ' + this._autoTransaction + ')');
  }
}

// Commits a transaction automatically if it was started automatically

Transact.prototype._closeAutoTransaction = function (opt, callback, newId) {// console.log("Auto commit check value for autoTransaction: " + this._autoTransaction + ' (Auto: ' + this._autoTransaction + ')');
  if (this._autoTransaction) {
    this.log("Auto committed: " + this._transaction_id); // + ' (Auto: ' + this._autoTransaction + ')';
    this.commit(opt, undefined, newId);
  }
}

// Cancels and commits a transaction automatically if it exceeds the idleTimeout threshold with no new actions

Transact.prototype._resetAutoCancel = function (isStartOnClient) {
  if (Meteor.isServer || isStartOnClient) {
    var self = this;
    if (Meteor.isServer) {
      Meteor.clearTimeout(this._autoCancel);
    }
    else {
      clearTimeout(this._autoCancel);
    }
    // It would be nice to use Meteor.clearTimeout and Meteor.setTimeout
    // but we need to sidestep the rule that timers can't be
    // started in simulations (which is what Meteor.setTimeout checks for)
    var onTimeOut = function () {
      self.log('Transaction (' + self._transaction_id + ') was cancelled after being inactive for ' + (tx.idleTimeout / 1000) + ' seconds.');
      self.rollback();
    };
    this._autoCancel = (Meteor.isServer) ? Meteor.setTimeout(onTimeOut, tx.idleTimeout) : setTimeout(onTimeOut, tx.idleTimeout);
  }
}

// Pushes the record of a single action to the "items" sub document that is going to be recorded in the transactions collection along with data about this transaction

Transact.prototype._pushToRecord = function (type, collection, _id, fieldData, instant, permissionCheckOverridden) {
  var item = this._createItem(type, collection, _id, fieldData, instant, permissionCheckOverridden);
  this._items.push(item);
  this._resetAutoCancel();
}

// Create item for queue

Transact.prototype._createItem = function (type, collection, _id, fieldData, instant, permissionCheckOverridden) {
  var item = {collection:collection._name, _id:_id, action:type, state: "pending"};
  if (typeof instant !== 'undefined' && instant) {
    item.instant = true;
    item.state = "done";
  }
  if (typeof permissionCheckOverridden !== 'undefined' && permissionCheckOverridden) {
    item.noCheck = true;  
  }
  if (typeof fieldData !== "undefined" && fieldData) {
    _.extend(item, fieldData);    
  }
  return item;
}

// Checks whether the permission check should be waived

Transact.prototype._permissionCheckOverridden = function (opt) {
  return typeof opt !== 'undefined' && opt.overridePermissionCheck;
}

// Uses a user-defined permission check as to whether this action is allowed or not

Transact.prototype._permissionCheck = function (action, collection, doc, updates) { // insert and remove send null for "updates" param, but this is where all the details of any update are found
  return tx.checkPermission(action, collection, doc, updates);
}

// Builds the context object

Transact.prototype._setContext = function (context) {
  _.extend(this._context, context);  
}

// This turns the data that has been stored in an array of key-value pairs into an object that mongo can use in an update

Transact.prototype._unpackageForUpdate = function (data) {
  var objForUpdate = {};
  _.each(data, function (val) {
    var unpackagedValue;
    if (val.json) {
      unpackagedValue = EJSON.parse(val.json);
    }
    else {
      unpackagedValue = val.value;
    }
    objForUpdate[val.key] = unpackagedValue;
  });
  return objForUpdate;
}

// This turns the data that is given as a mongo update into an array of key-value pairs that can be stored
  
Transact.prototype._packageForStorage = function (update) {
  var arrForStorage = [];
  _.each(update.data, function (value, key) {
    var packagedValue = {};
    if ((_.isObject(value) || _.isArray(value)) && !_.isDate(value)) { // a date is considered an object by _.isObject (because it is, I suppose)
      packagedValue.json = EJSON.stringify(value);
    }
    else {
      packagedValue.value = value;
    }
    arrForStorage.push(_.extend({key: key}, packagedValue));
  });
  return {command: update.command, data: arrForStorage};
  
}

Transact.prototype._Collection2Support = function (collection, opt) {
  // The following is a very sketchy attempt to support collection2 options
  // Requires aldeed:collection2 to be before babrahams:transactions in .packages
  // which we do through a weak dependency on aldeed:collection2
  return _.isFunction(collection.simpleSchema)
    && collection.simpleSchema() !== null
    && _.find([
      "validationContext",
      "validate",
      "filter",
      "autoConvert",
      "removeEmptyStrings",
      "getAutoValues",
      "replace",
      "upsert",
      "extendAutoValueContext",
      "trimStrings",
      "extendedCustomContext",
      "transform"
    ],
    function (c2option) {
      return typeof opt[c2option] !== "undefined";
    }
  );
}

Transact.prototype._changeItemState = function (data) {
  
  // Need to make a write to the transaction record, marking this action as `done`
  var m = {};
  m["items." + data.index + ".state"] = data.state;
  Transactions.update({_id: data.txid}, {$set: m});
  
}

Transact.prototype._userOrNull = function () {
  var userId = null;
  // Need the try-catch because we don't know if this is getting called from a method or from plain server code
  // If from plain server code, it will throw an error
  try {
    userId = _.isFunction(Meteor.userId) && Meteor.userId();
  }
  catch (err) {
    return null;  
  }
  return userId;
}

/**
 *  Actually execute the transaction - i.e. make the db writes
 */

Transact.prototype._processTransaction = function (txid, description, items, context, cannotOverridePermissionCheck) {

  check(txid,String);
  check(description,String);
  check(items, Array);
  check(context, Object);
  check(cannotOverridePermissionCheck, Boolean); 
  
  if (items && items.length && !tx._checkTransactionFields(items, txid, cannotOverridePermissionCheck)) {
    throw new Meteor.Error('Transaction not allowed'); // TODO -- we need a bit of a better error message than this!
    return; 
  }
  // Here is where we need to execute the 2-phase commit
  // We begin by setting the transaction document with all write info to a state of pending
  var existingTransaction = Transactions.findOne({_id: txid});
  if (existingTransaction) {
    // throw new Meteor.Error('Transaction with duplicate _id found');
    // return;
    // This is here because we have some {instant: true} calls
    // Overwrite the items field with the full complement of items in the queue
    // Also overwrite context with context from all item calls,
    // and any manual tx.setContext calls
    Transactions.update({_id: txid}, {$set: {items: items, context: context, description: description, lastModified: ServerTime.date()}});
  }
  
  // First, need to iterate over the changes that are going to be made and make sure that,
  // if there are hard removes, the db version of the doc gets stored on the transaction
  _.each(items, function (item, index) {
    if (item.action === "remove" && item.hardDelete) {
      // Get the existing doc and store it in the transaction record
      // We overwrite the temporary version of the doc from an instant remove on the client
      // Because chances are that the whole document was not available on the client
      var Collection = tx.collectionIndex[item.collection];
      var doc = Collection.findOne({_id: item._id}); // , {transform: null}
      items[index].doc = doc;
    }
  });
  
  // STEP 1 - Set initial state of transaction to "pending"

   if (!existingTransaction && !Transactions.insert({_id: txid, user_id: tx._userOrNull(), description: description, items: items, context: context, lastModified: ServerTime.date(), state: "pending"})) {
     throw new Meteor.Error('Unable to commit transaction');
     return; 
   }
  
  // STEP 2 - Make changes specified by items in the queue
  var success = true;
  var self = this;
  var logErrors = function (err) {
    self.log(err.toString());
  };
  var updateCache = {};
  var cacheValues = function (item, index) {
    _.each(item.update.data, function (keyValuePair, i) {
      if (_.isUndefined(updateCache[item.collection])) {
        updateCache[item.collection] = {};
      }
      if (_.isUndefined(updateCache[item.collection][item._id])) {
        updateCache[item.collection][item._id] = {};
      }
      // If there's an item in the update cache, we need to overwrite the transaction record now
      // Because we know it probably has the wrong inverse value
      if (!_.isUndefined(updateCache[item.collection][item._id][keyValuePair.key])) {
        var mod = tx._unpackageForUpdate([{
          key: "items." + index + ".inverse.data." + i + ".value",
          value: updateCache[item.collection][item._id][keyValuePair.key]
        }]);
        var update = {$set: mod};
        if (cannotOverridePermissionCheck) {
          update["$unset"] = {noCheck: 1};
        }
        Transactions.update({_id: txid}, update);          
      }
      updateCache[item.collection][item._id][keyValuePair.key] = keyValuePair.value;
    });
  }
  var newIdValues = {};
  _.each(items, function (item, index) {
    if (success) {
      try {
        if (item.instant) {
          // Already done -- don't do it again
          if (item.action === 'update') {
             // Cache values
             cacheValues(item, index);
          }
          return;    
        }
        var Collection = tx.collectionIndex[item.collection];
        var txData = {transaction_id: txid};
        switch (item.action) {
          case 'insert' :
            
            // Will run synchronously. If this fails an exception will be thrown
            var newId = Collection.insert(_.extend(item.doc, {_id: item._id}, txData));
            
            // The insert succeeded
            items[index].state = 'done';
            self.log("Executed insert");

            break;
          case 'update' :
            var modifier = {};
            var data = tx._unpackageForUpdate(item.update.data);
            modifier[item.update.command] = data;
            if (modifier["$set"]) {
              // Add to the $set modifier
              modifier["$set"] = _.extend(modifier["$set"], txData);
            }
            else {
              // Add a $set modifier
              modifier["$set"] = txData;
            }

            // Will run synchronously. If this fails an exception will be thrown
            Collection.update({_id: item._id}, modifier);

            // The update succeeded
            // Cache values
            if (item.update.command === "$set") {
              cacheValues(item, index);
            }
            items[index].state = 'done';
            self.log("Executed update");

            break;
          case 'remove' :
            if (item.hardDelete) {

              // Remove the whole document
              // Will run synchronously. If this fails an exception will be thrown
              var removed = Collection.remove({_id: item._id});

              // The remove succeeded
              items[index].state = 'done';
              self.log('Executed remove');
            }
            else {
              // Just do a soft delete
              // Will run synchronously. If this fails an exception will be thrown
              Collection.update({_id: item._id}, {$set: _.extend(txData, {deleted: ServerTime.date()})});

              // The remove succeeded
              items[index].state = 'done';
              self.log('Executed remove');

            }
            break;
          default :
            // Do nothing
        }
      }
      catch (err) {
        success = false;
        logErrors(err);
      }
    }
    
    if (success) {
      tx._changeItemState({
        txid: txid,
        index: index,
        state: 'done'
      });
    }
    
  });
  
  // STEP 3 - Set state to "done"
  if (success) {
    var self = this;
    Transactions.update({_id: txid}, {$set: {state: "done", lastModified: ServerTime.date()}}, function (err, res) {
      if (err) {
        self.log('Could not complete transaction:', txid, err);
        success = false;    
      }
    });
    if (success) {
      var finalTxRecord = Transactions.findOne({_id: txid});
      return {items: finalTxRecord.items};
    }
  }
  else {
    self.log('Transaction failed');
    // Need to run the items through a rollback with actual inverse writes
    var rollbackAllDoneItems = true;
    tx._transaction_id = txid;
    tx._items = items;
    tx._description = description;
    tx._context = context;
    tx.rollback.call(tx, rollbackAllDoneItems);
  }
        
}


// *******
// Methods
// *******

// These are the methods that actually do the commits and undo and redo work
// They would usually not be called directly -- but invoked using tx.undo() and tx.redo()
// Although these methods are pretty large, we're including them on both client and server
// because we want to maintain latency compensation on the client

Meteor.methods({

  '_meteorTransactionsProcess' : function (txid, description, items, context) {
    
    check(txid,String);
    check(description,String);
    check(items, Array);
    check(context, Object); 
    
    var cannotOverridePermissionCheck = true;
    
    return tx._processTransaction(txid, description, items, context, cannotOverridePermissionCheck);
    
  },
  
  '_meteorTransactionsUndo' : function (txid) {
    check(txid,Match.OneOf(String,null,undefined));
    if (tx.requireUser && !Meteor.userId()) {
      console.log('You must be logged in to undo actions.');
      return;
    }
    // Get the latest transaction done by this user and undo it
    var expired = false;
    var queuedItems = [];
    var selector = (txid) ? { _id: txid} : {user_id: tx._userOrNull()};
    var sorter = (txid) ? undefined : {sort: {lastModified: -1}, limit:1};
    var lastTransaction = Transactions.find(_.extend(selector, {$or: [{undone: null}, {undone: {$exists: false}}], expired: {$exists: false}, state: "done"}), sorter).fetch()[0];
    if (lastTransaction && typeof lastTransaction.items !== 'undefined') {
      // Check that user still has permission to edit all these items
      // Undo in reverse order
      // e.g. Need to undo removes first, so that docs are available for undo updates if docs were updated before removal
      if (tx._checkTransactionFields(lastTransaction.items, lastTransaction._id)) {
        _.each(lastTransaction.items.reverse(), function (obj, index) {
          if (obj.action === 'remove') {
            if (!expired) {
              if (obj.doc) {
                // This doc is here because the original was removed
                // First check for duplicates -- if there is one, the transaction has expired
                if (tx.collectionIndex[obj.collection].find(obj.doc._id).count()) {
                  expired = true;  
                }
                else {
                  queuedItems.push(function () {
                    tx.collectionIndex[obj.collection].insert(obj.doc);
                  });
                }
              }
              else {
                // This was removed with softDelete
                queuedItems.push(function () {
                  tx.collectionIndex[obj.collection].update({_id: obj._id}, {$unset: {deleted: 1, transaction_id: lastTransaction._id}});
                });
              }
            }
          }
          if (obj.action === 'update') {
            if (!expired) {
              if (typeof obj.inverse !== 'undefined' && obj.inverse.command && obj.inverse.data) {
                var operation = {};
                operation[obj.inverse.command] = tx._unpackageForUpdate(obj.inverse.data); // console.log('inverse operation:'+EJSON.stringify(operation));
                queuedItems.push(function () {
                  tx.collectionIndex[obj.collection].update({_id: obj._id}, operation);
                  /* console.log("operation called:"+EJSON.stringify(operation)); */
                });
              }
            }
          }
          if (obj.action === 'insert') {
            if (!expired) {
              var sel = {_id: obj._id};
              // This transaction check is in case the document has been subsequently edited -- in that case, we don't want it removed from the database completely
              // Instead, we remove this transaction from the visible list by setting expired to true
              sel.transaction_id = lastTransaction._id;
              queuedItems.push(function () { tx.collectionIndex[obj.collection].remove(sel); } );
              if (tx.collectionIndex[obj.collection].findOne({_id: obj._id, $and: [{transaction_id: {$exists: true}}, {transaction_id: {$ne: lastTransaction._id}}]})) {
                // Transaction has expired
                expired = true; // This is to tell the client that the transaction has expired and the undo was not executed
              }
            }
          }
        });
        if (!expired) {
          // Process queue
          _.each(queuedItems,function (queuedItem, index) {
            var fail = false;
            try {
              queuedItem.call();
            }
            catch (err) {
              fail = true;    
            }
            if (!fail) {
              tx._changeItemState({
                txid: lastTransaction._id,
                index: (queuedItems.length - 1) - index, // Because array has been reversed for undo
                state: 'undone'
              });
            }
          });
        // After an undo, we need to update transaction document
          Transactions.update({_id: lastTransaction._id}, {$set: {undone: ServerTime.date(), state: 'undone'}});
        }
      }
      else {
        // Non-empty transaction, but user has lost the permission to edit at least one of the items encompassed by the transaction
        expired = true; 
      }
      if (expired) {
        // Flag this as expired in the db to keep it out of the user's undo/redo stack
        Transactions.update({_id: lastTransaction._id}, {$set: {expired: true}});  
      }
    }
    else if (lastTransaction) {
      // Auto clean - this transaction is empty
      Transactions.remove({_id: lastTransaction._id});
    }
    return expired; // If the function returns true, the undo failed
  },
  
  '_meteorTransactionsRedo' : function (txid) {
    check(txid,Match.OneOf(String, null, undefined));
    if (tx.requireUser && !Meteor.userId()) {
      console.log('You must be logged in to redo actions.');
      return;
    }
    // Get the latest undone transaction by this user and redo it
    var expired = false;
    var queuedItems = [];
    var selector = (txid) ? {_id: txid} : {user_id: tx._userOrNull()};
    var sorter = (txid) ? undefined : {sort: {undone: -1}, limit: 1};
    var lastUndo = Transactions.find(_.extend(selector, {undone: {$exists: true, $ne: null}, expired: {$exists: false}}), sorter).fetch()[0];
    if (lastUndo && typeof lastUndo.items !== 'undefined') {
      // Check that user still has permission to edit all these items
      if (tx._checkTransactionFields(lastUndo.items, lastUndo._id)) {
        _.each(lastUndo.items, function (obj, index) {
          if (obj.action === "remove") {
            if (obj.doc) {
              // This document was removed using a hard delete the first time
              // We'll hard delete again, making no attempt to save any modifications that have happened to the document in the interim
              queuedItems.push(function () { tx.collectionIndex[obj.collection].remove({_id: obj._id})});
            }
            else {
              queuedItems.push(function () { tx.collectionIndex[obj.collection].update({_id: obj._id}, {$set: {deleted: ServerTime.date(), transaction_id: lastUndo._id}})});
            }
          }
          if (obj.action === "update") {
            if (typeof obj.update !== 'undefined' && obj.update.command && obj.update.data) {
              var operation = {};
              operation[obj.update.command] = tx._unpackageForUpdate(obj.update.data);// console.log(operation);
              queuedItems.push(function () { tx.collectionIndex[obj.collection].update({_id: obj._id}, operation); });
            }
          }
          if (obj.action === "insert") {
            if (!expired) {
              if (!tx.collectionIndex[obj.collection].find({_id: obj._id}).count()) {
                var newDoc = _.extend(obj.doc, {transaction_id: lastUndo._id,_id: obj._id});
                queuedItems.push(function () { tx.collectionIndex[obj.collection].insert(newDoc) });
              }
              else {
                // This is an edited doc that was not removed on last undo
                // Transaction has expired
                expired = true; // This is to tell the client that the transaction has expired and the redo was not executed
              }
            }
          }
        });
        if (!expired) {
          // Process queue
          _.each(queuedItems, function (queuedItem, index) {
            var fail = false;
            try {
              queuedItem.call();
            }
            catch (err) {
              fail = true;    
            }
            if (!fail) {
              tx._changeItemState({
                txid: lastUndo._id,
                index: index,
                state: 'done'
              });
            }
          });
          // After a redo, we need to update the transaction document
          Transactions.update({_id: lastUndo._id}, {$unset: {undone: 1}, $set: {state: 'done'}}); // ,$set:{lastModified: ServerTime.date()} -- LEADS TO UNEXPECTED RESULTS
        }
      }
      else {
        // User no longer has permission to edit one of the items in this transaction
        expired = true;  
      }
      if (expired) {
        // Flag this transaction as expired to keep it out of the user's undo-redo stack
        Transactions.update({_id: lastUndo._id}, {$set: {expired: true}});  
      }
    }
    return expired; // If the function returns true, the redo failed
  }
  
});


// Wrap DB write operation methods
// Wrapping technique shamelessly stolen from aldeed:collection2 codebase
// (https://github.com/aldeed/meteor-collection2/blob/master/collection2.js) and modified for this package

// backwards compatibility
if (typeof Mongo === "undefined") {
  Mongo = {};
  Mongo.Collection = Meteor.Collection;
}

_.each(['insert', 'update', 'remove'], function (methodName) {
  var _super = Mongo.Collection.prototype[methodName];
  Mongo.Collection.prototype[methodName] = function () {
    var self = this, args = _.toArray(arguments); // self is the Mongo.Collection instance
    var optionsArg = (methodName === 'update') ? 2 : 1;
    if (_.isObject(args[optionsArg]) && args[optionsArg].tx) {
      args.unshift(self);
      return tx[methodName].apply(tx, args);
    }
    return _super.apply(self, args);
  };
});

// Here we ensure the the tx object is aware of the apps collections and can access them by name
// we use dburles:mongo-collection-instances package to do this.
// We also check for the presence of SimpleSchema and extend the schema of existing
// collections to allow for the fields that transactions will add to documents

Meteor.startup(function () {
  Meteor.defer(function () {
    
    // Auto detect collections
    tx.collectionIndex = (_.isEmpty(tx.collectionIndex)) ? _.reduce(Mongo.Collection.getAll(), function (memo, coll) { memo[coll.name] = coll.instance; return memo; }, {}) : tx.collectionIndex;
    
    // Built in support for simple-schema/collection2
    if (typeof SimpleSchema !== 'undefined') {
      _.each(tx.collectionIndex, function (collection) {
        if (_.isFunction(collection.simpleSchema) && collection.simpleSchema() !== null && collection._c2) {
          collection.attachSchema({deleted: {type: Date, label: "Deleted", optional: true}, transaction_id: {type:String, label: "transaction_id", optional: true}, _id: {type: String, label: "_id", optional: true}});
        }
      });
      if (_.isFunction(tx.Transactions.attachSchema)) {
        var userPattern = {
          type:String,
          label:"User Id"
        }
        if (!tx.requireUser) {
          userPattern.optional = true;    
        }
        var TransactionSchema = new SimpleSchema({
          "context": {
            type:Object,
            label:"Context",
            blackbox:true,
            optional:true
          },
          "description": {
            type:String,
            label:"Description"
          },
          "items": {
            type:[Object],
            label:"Items",
            blackbox:true,
            optional:true
          },
          "lastModified": {
            type:Date,
            label:"Timestamp"
          },
          "undone": {
            type:Date,
            label:"Undone",
            optional:true
          },
          "user_id": userPattern,
          "expired": {
            type:Boolean,
            label:"Expired",
            optional:true
          },
          "state": {
            type:String,
            label:"state"  
          }
        });
        tx.Transactions.attachSchema(TransactionSchema);
      }
    }
  });
});
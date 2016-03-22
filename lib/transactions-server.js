// *******************************
// Transactions manager for Meteor
// by Brent Abrahams
// brent_abrahams@yahoo.com
// MIT Licence 2015
// *******************************
  
// This script makes an attempt to restore db state after a break during a transaction

Meteor.startup(function() {
  
  // Add a function to purge transactions that
  // are never going to be completed or rolled back successfully
  
  Transact.prototype.purgeIncomplete = function () {
    Transactions.remove({state: {$nin: ['done', 'undone']}});
  }
  
  Transact.prototype._repairAllIncomplete = function (mode) {
    if (_.contains(['complete', 'rollback'], mode)) {
      var sortDirection = (mode === 'rollback') ? -1 : 1;
      Transactions.find({state: 'pending'}, {sort: {lastModified: sortDirection}}).forEach(function (transaction) {
        tx._repairIncomplete(transaction, mode); 
      });
    }
  }
  
  // Attempts to repair incomplete transactions
  // `transaction` is a single transaction document
  // `type` is a string -- possible values: "complete", "rollback"
  
  Transact.prototype._repairIncomplete = function (transaction, mode) {
    tx.log('Attempting to repair transaction by ' + mode + ':', transaction);
    // Set the state of this transaction to the mode until it is complete
    if (!Transactions.update({_id: transaction._id}, {$set: {state: mode}})) {
      tx.log('Unable to ' + mode + ' transaction');
      return;    
    }
    var items = (mode === 'rollback') ? transaction.items.reverse() : transaction.items;
    var failed = false;
    var targetState = (mode === 'rollback') ? 'undone' : 'done';
    // From a security standpoint, it would be nice to put
    // var failed = tx._checkTransactionFields(items, transaction._id);
    // but we can't guarantee that the user-defined permission checks
    // that `tx._checkTransactionFields` invokes
    // won't be dependent upon Meteor.user() or Meteor.userId()
    // which, of course, won't be defined when called from this context.
    // We are trusting that this package has not let anything into the `transactions`
    // collection that shouldn't be there.
    _.each(items, function (item, index) {
      // Note, at this stage we are only supporting repair of incomplete commits
      // TODO -- this could be extended to include incomplete undos or redos
      if (!((mode === 'complete' && item.state === 'pending')
         || (mode === 'rollback' && item.state === 'done'))) {
        // Either we don't deal with this state
        // Or the action we wanted to do is already done
        tx.log('Skipped "' + mode + ' ' + item.action + '" as it is ' + item.state + ':', item);
        return;  
      }
      Collection = tx.collectionIndex[item.collection];
      try {
        switch (item.action) {
          case 'insert' :
            switch (mode) {
              case 'complete' :
                if (!Collection.insert(item.newDoc)) {
                  failed = true;    
                }
                break;
              case 'rollback' :
                if (!Collection.remove({_id: item._id})) {
                  failed = true;    
                }
                break;    
            }
          case 'remove' :
            switch (mode) {
              case 'complete' :
                if (item.hardDelete) {
                  // We are storing the document as it was then, not as it is now
                  // to preserve some consistency in case of later updates
                  if (!Collection.remove({_id: item._id})) {
                     failed = true;  
                  }
                }
                else {
                  if (!Collection.update({_id: item._id}, {$set: {deleted: ServerTime.date(), transaction_id: transaction._id}})) {
                    failed = true;  
                  }
                }
                break;
              case 'rollback' :
                if (item.hardDelete) {
                  if (!Collection.insert(item.doc)) {
                    failed = true;  
                  }
                }
                else {
                  /*if (!Collection.update({_id: item._id}, {$unset: {deleted: 1, transaction_id: 1}})) {
                    failed = true;  
                  }*/
                  // Can't do above as those fields might already be unset, resulting in a 0 being returned
                  // Should just use callbacks with error checks
                  Collection.update({_id: item._id}, {$unset: {deleted: 1, transaction_id: 1}});
                }
                break;    
            }
          case 'update' :  
            switch (mode) {
              case 'complete' : 
                if (typeof item.update !== 'undefined' && item.update.command && item.update.data) {
                  var operation = {};
                  operation[item.update.command] = tx._unpackageForUpdate(item.update.data);
                  /*if (!Collection.update({_id: item._id}, operation)) {
                    failed = true;  
                  }*/
                  Collection.update({_id: item._id}, operation);
                }
                break;
              case 'rollback' :
                if (typeof item.inverse !== 'undefined' && item.inverse.command && item.inverse.data) {
                  var operation = {};
                  operation[item.inverse.command] = tx._unpackageForUpdate(item.inverse.data);
                  /*if (!Collection.update({_id: item._id}, operation)) {
                    failed = true;  
                  }*/
                  Collection.update({_id: item._id}, operation);
                }
                break;   
            }
        }
      }
      catch (err) {
        tx.log(err);
        failed = true;  
      }
      if (!failed) {
        // Need to change the state of this particular action
        var modifier = {};
        // Array is reversed for a rollback, so index needs to be calculated from other end of array
        var trueIndex = (mode === 'rollback') ? (items.length - 1) - index : index;
        modifier["items." + trueIndex + ".state"] = targetState; 
        Transactions.update({_id: transaction._id}, {$set: modifier});
      }
    });
    // Record this whole transaction as completed
    if (!failed) {
      var modifier = {};
      if (mode === 'rollback') {
        modifier["$set"] = {state: "undone", undone: ServerTime.date()};
      }
      else {
        modifier["$unset"] = {undone: 1};
        modifier["$set"] = {state: "done"};
      }
      Transactions.update({_id: transaction._id}, modifier);
      tx.log('Transaction repaired by ' + mode + ':', Transactions.findOne({_id: transaction._id}));
    }
    else {
      tx.log('Could not ' + mode + ' transaction:', Transactions.findOne({_id: transaction._id}));
    }
  }

  Meteor.defer(function() {
      
    // Give time for everything else to be set up by the transactions-common.js script
    tx._repairAllIncomplete(tx.selfRepairMode);

  });

});
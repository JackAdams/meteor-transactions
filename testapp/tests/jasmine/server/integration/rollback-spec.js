'use strict';

/**
 * Tests for rollback returning initial state
 * if an error is thrown
 */

describe('rollback after updates are made', function () {
  var transaction_id, insertedFooDoc;

  beforeEach(function () {
    // Fake userId to get through tx userId checks
    spyOn(Meteor,'userId').and.returnValue('or6YSgs6nT8Bs5o6p');

    tx.start('insert foo');
    fooCollection.insert(
      {foo: "Initial state"}, {tx: true});
    tx.commit();

    insertedFooDoc = fooCollection.findOne({foo: {$exists: true}});
    expect(insertedFooDoc.transaction_id).toBeDefined();
    transaction_id = insertedFooDoc.transaction_id; 
  });

  afterEach(function () {
    fooCollection.remove({});
    tx.Transactions.remove({});
  });
 
  it ('should return any instant changes to initial state', function () {
    // SETUP
    // EXECUTE
    tx.start('update foo field then call a rollback');
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $set: {
          foo: "Transitional state"
        }
      },
      {
        tx: true,
		instant: true
      }
    );
	
	// Check the update was made
	var recoveredFoo = fooCollection.findOne(
    {_id: insertedFooDoc._id});
	expect(recoveredFoo.foo === "Transitional state").toBe(true);
	
	tx.rollback();
	
	/*fooCollection.update(
	  {_id: insertedFooDoc._id},
	  {
	    $set: {
		  foo: "Post-rollback state"
		}
	  },
	  {
	    tx: true
	  }
	);*/
	
	tx.commit();
	
    // VERIFY
    var recoveredFoo = fooCollection.findOne(
    {_id: insertedFooDoc._id});
    expect(recoveredFoo.foo === "Transitional state").toBe(false);
    expect(recoveredFoo.foo === "Initial state").toBe(true);
    // Check transaction
    var txDoc = tx.Transactions.findOne({_id: recoveredFoo.transaction_id});
    expect(txDoc.state).toEqual("rolledBack");

  });
  
  it ('should still work with server error', function () {
    // SETUP
    // EXECUTE
    var txid = tx.start('update foo field then throw an error');
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $set: {
          foo: "Transitional state"
        }
      },
      {
        tx: true,
		instant: true
      }
    );
	
	// Check the update was made
	var recoveredFoo = fooCollection.findOne(
    {_id: insertedFooDoc._id});
	expect(recoveredFoo.foo === "Transitional state").toBe(true);
	
	fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $set: {
          foo: "Second transitional state"
        }
      },
      {
        tx: true
      }
    );
	
	// Create an error with a duplicate key
	fooCollection.insert(
	  {_id: insertedFooDoc._id, foo: "Should not be inserted"},
	  {
	    tx: true
	  }
	);
	
	tx.commit();
	
	// console.log("transactionDoc:", tx.Transactions.findOne({_id: txid}));
	// console.log("recoveredFoo:", insertedFooDoc, fooCollection.findOne({_id: insertedFooDoc._id}));
    
	// VERIFY
    var recoveredFoo = fooCollection.findOne(
    {_id: insertedFooDoc._id});
    expect(recoveredFoo.foo === "Transitional state").toBe(false);
	expect(recoveredFoo.foo === "Second transitional state").toBe(false);
    expect(recoveredFoo.foo === "Initial state").toBe(true);
    // Check transaction
    var txDoc = tx.Transactions.findOne({_id: recoveredFoo.transaction_id});
    expect(txDoc.state).toEqual("rolledBack");

  });
  
  it ('should restore state if a non-existent document is removed', function () {
    // SETUP
	
	// First remove the doc
    fooCollection.remove(
      {_id: insertedFooDoc._id}
    );
	
	// EXECUTE
    var txid = tx.start('remove non-existent doc then throw an error in the same transaction');
	
	expect(txid).toBeDefined();
    
	// Then try and remove it again via a transaction
	
	fooCollection.remove(
	  {_id: insertedFooDoc._id},
	  {
		tx: true,
		instant: true
	  }
	);
	
	// Check the update was made
	var recoveredFoo = fooCollection.findOne(
    {_id: insertedFooDoc._id});
	expect(recoveredFoo).toBe(undefined);
	
	// Throw a hard error in mongo to force a rollback
	fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $noSuchOperation: {
          foo: "Second transitional state"
        }
      },
      {
        tx: true
      }
    );
	
	tx.commit();
	
	// console.log("transactionDoc:", tx.Transactions.findOne({_id: txid}).items);
	// console.log("recoveredFoo:", insertedFooDoc, fooCollection.findOne({_id: insertedFooDoc._id}));
    
	// VERIFY
	// Make sure the removed document doesn't end up in the database again
    var recoveredFoo = fooCollection.findOne(
    {_id: insertedFooDoc._id});
    expect(recoveredFoo).toBe(undefined);
    // Check transaction
    var txDoc = tx.Transactions.findOne({_id: txid});
	expect(txDoc.items.length).toBe(2);
    expect(txDoc.state).toEqual("rolledBack");

  });

});
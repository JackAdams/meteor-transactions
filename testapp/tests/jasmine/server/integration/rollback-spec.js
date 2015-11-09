'use strict';

/**
 * Tests for rollback returning initial state
 * if an error is thrown
 */

describe('rollback after transaction times out', function () {
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
    tx.start('update foo field then throw an error');
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

});
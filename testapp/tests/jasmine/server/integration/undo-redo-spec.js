'use strict';

/**
 * Tests for ability to recover a document's initial state after multiple updates to
 * a single field in a single transaction
 */

describe('after an insert with an update, followed by an undo and redo', function () {
  var transaction_id, insertedFooDoc;

  beforeEach(function () {
    // Fake userId to get through tx userId checks
    spyOn(Meteor,'userId').and.returnValue('or6YSgs6nT8Bs5o6p');
	
  });

  afterEach(function () {
    fooCollection.remove({});
    tx.Transactions.remove({});
  });
  
  it('doc should be in the same state as after the action', function () {
	 // SET UP
	 tx.start('insert foo');
	 var newId = fooCollection.insert(
	   {foo: "Initial state"}, {tx: true, instant: true});
	 var fooDoc = fooCollection.findOne({_id: newId});
	 expect(fooDoc).toBeDefined();
	 expect(fooDoc.foo).toEqual("Initial state");
	 fooCollection.update({_id: newId}, {$set: {foo: "Secondary state"}}, {tx: true});
	 fooCollection.update({_id: newId}, {$set: {bar: "Other value"}}, {tx: true});
	 tx.commit();
	 
	 var fooDoc = fooCollection.findOne({foo: "Secondary state"});
     expect(fooDoc).toBeDefined();
	 expect(fooDoc.transaction_id).toBeDefined();
	 transaction_id = fooDoc.transaction_id;
	  
	 // EXECUTE
	 tx.undo(transaction_id);
	 
	 var fooDoc = fooCollection.findOne({_id: newId});
	 expect(fooDoc).toBeUndefined();
	 
	 tx.redo(transaction_id);
	 
	 var fooDoc = fooCollection.findOne({foo: "Initial state"});
	 expect(fooDoc).toBeUndefined();
	 
	 var fooDoc = fooCollection.findOne({foo: "Secondary state"});
	 expect(fooDoc._id).toEqual(newId);
	 expect(fooDoc.transaction_id).toEqual(transaction_id);
  });

});
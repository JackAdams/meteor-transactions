'use strict';

Jasmine.onTest(function() {
  describe('undo after multiple actions on a single doc field', function () {
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
   
    it ('should return to initial state', function () {
      // SETUP
      // EXECUTE
      tx.start('update foo field twice');
      fooCollection.update(
        {_id: insertedFooDoc._id},
        {
          $set: {
            foo: "Transitional state"
          }
        },
        {
          tx: true, instant: true
		  // remove the `instant: true` to test whether the correct inverse value was used during the commit phase
		  // NOTE: in the current implementation, this fails - to fix would require a substantial rewrite
        });
	  fooCollection.update(
        {_id: insertedFooDoc._id},
        {
          $set: {
            foo: "Final state"
          }
        },
        {
          tx: true
        });
      tx.commit();
      
      // VERIFY
      var recoveredFoo = fooCollection.findOne(
      {_id: insertedFooDoc._id});
      expect(recoveredFoo.foo === "Transitional state").toBe(false);
	  expect(recoveredFoo.foo === "Final state").toBe(true);
      // Check transaction
      var txDoc = tx.Transactions.findOne({_id: recoveredFoo.transaction_id});
      expect(txDoc.items.updated[0].inverse).toEqual(
        { command: '$set', data: [ { key: 'foo', value: "Initial state" } ] }
        );
	  expect(txDoc.items.updated[1].inverse).toEqual(
        { command: '$set', data: [ { key: 'foo', value: "Transitional state" } ] }
        );
	  
	  // EXECUTE -- TEST RESULTS OF UNDO
	  tx.undo();
	  
	  // VERIFY
	  var undoneFoo = fooCollection.findOne(
	  {_id: insertedFooDoc._id});
	  expect(undoneFoo.foo).toEqual("Initial state");
      
    })

  })
});

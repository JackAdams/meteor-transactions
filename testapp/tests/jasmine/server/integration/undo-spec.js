'use strict';

/**
 * Tests for ability to recover a document's initial state after multiple updates to
 * a single field in a single transaction
 */

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
  
  it('should leave fields set that were already set', function () {
	 // SET UP
	 fooCollection.update({_id: insertedFooDoc._id}, {$set: {bar: 4}});
	 // EXECUTE
	 var txid = tx.start('make $set update that adds a field and updates a field');
	 fooCollection.update({_id: insertedFooDoc._id}, {$set: {bar: 5, baz: 3}}, {tx: true});
	 tx.commit();
	 tx.undo(txid);
	 var fooDoc = fooCollection.findOne({_id: insertedFooDoc._id});
	 expect(fooDoc.foo).toEqual('Initial state');
	 expect(fooDoc.bar).toEqual(4);
	 expect(fooDoc.baz).toBeUndefined();
	 // Now do it again with the field order reversed
	 txid = tx.start('make another $set update that adds a field and updates a field');
	 fooCollection.update({_id: insertedFooDoc._id}, {$set: {baz: 5, bar: 3}}, {tx: true});
	 tx.commit();
	 tx.undo(txid);
	 expect(fooDoc.foo).toEqual('Initial state');
	 expect(fooDoc.bar).toEqual(4);
	 expect(fooDoc.baz).toBeUndefined();
  });
 
  it ('should return to initial state', function () {
    // SETUP
    // EXECUTE
    tx.start('update foo field three times');
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $set: {
          foo: "First transitional state"
        }
      },
      {
        tx: true
      }
    );
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $set: {
          foo: "Second transitional state"
        }
      },
      {
        tx: true, instant: true
        // remove the `instant: true` to test whether the correct inverse value was used during the commit phase
      }
    );
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $set: {
          foo: "Final state"
        }
      },
      {
        tx: true
      }
    );
    tx.commit();
    
    // VERIFY
    var recoveredFoo = fooCollection.findOne(
    {_id: insertedFooDoc._id});
    expect(recoveredFoo.foo === "First transitional state").toBe(false);
    expect(recoveredFoo.foo === "Second transitional state").toBe(false);
    expect(recoveredFoo.foo === "Final state").toBe(true);
    // Check transaction
    var txDoc = tx.Transactions.findOne({_id: recoveredFoo.transaction_id});
    expect(txDoc.items[0].inverse).toEqual(
      { command: '$set', data: [ { key: 'foo', value: "Initial state" } ] }
      );
    expect(txDoc.items[1].inverse).toEqual(
      { command: '$set', data: [ { key: 'foo', value: "First transitional state" } ] }
      );
    expect(txDoc.items[2].inverse).toEqual(
      { command: '$set', data: [ { key: 'foo', value: "Second transitional state" } ] }
      );
    
    // EXECUTE -- TEST RESULTS OF UNDO
    tx.undo();
    
    // VERIFY
    var undoneFoo = fooCollection.findOne(
    {_id: insertedFooDoc._id});
    expect(undoneFoo.foo).toEqual("Initial state");
    
  });

});
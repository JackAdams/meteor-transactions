'use strict';

/**
 * Tests for ability to recover database state after hardware failure
 */

describe('state after hardware failure', function () {
  var transaction_id, insertedFooDoc, fooDocId, relatedFooDoc, relatedFooDocId;

  beforeEach(function () {
    // Fake userId to get through tx userId checks
    spyOn(Meteor,'userId').and.returnValue('or6YSgs6nT8Bs5o6p');
    
    // Set up a hardware failure scenario
    // In which one write has been made, but the other has not
    // And the second write depends on the first
    // i.e. insert a doc and use the created id to create a field on a doc to be inserted
    
    tx.start('insert foo');
      fooDocId = fooCollection.insert(
        {state: "initial"}, {tx: true, instant: true});
      fooCollection.update({_id: fooDocId}, {$set: {state: "final"}}, {tx: true});
    tx.commit();

    insertedFooDoc = fooCollection.findOne({_id: fooDocId});
    expect(insertedFooDoc).toBeDefined();
    expect(insertedFooDoc.transaction_id).toBeDefined();
    transaction_id = insertedFooDoc.transaction_id;

    // Now we make a couple of changes to the db to simulate failure after the insert
    // but before the update
    // The state of the `foo` field should still be "initial"
    // and there should be no transaction_id set
    // and the transaction state should still be "pending"
    // the state on the action that hasn't been completed should also be "pending", not "done"

    tx.Transactions.update({_id: transaction_id}, {$set: {state: "pending", "items.1.state": "pending"}});
    fooCollection.update({_id: insertedFooDoc._id}, {$set: {state: "initial"}});

  });

  afterEach(function () {
    fooCollection.remove({});
    tx.Transactions.remove({});
  });
 
  it ('can be recovered by a rollback', function () {
    
    // Perform the same rollback that would be performed on startup
    
    tx._repairAllIncomplete('rollback');
    
    // VERIFY
    var recoveredFoo = fooCollection.findOne(
    {_id: insertedFooDoc._id});
    expect(recoveredFoo).toBeUndefined();
    // Check transaction
    var txDoc = tx.Transactions.findOne({_id: transaction_id});
    expect(txDoc.items[0].state).toEqual("undone");
    expect(txDoc.items[1].state).toEqual("pending");
    expect(txDoc.state).toEqual("undone");
    
  })

  it ('can be made consistent by completing unfinished transaction', function () {
    
    // Perform the same completion of unfinished transaction that would be performed on startup
    
    tx._repairAllIncomplete('complete');
    
    // VERIFY
    var recoveredFoo = fooCollection.findOne({_id: insertedFooDoc._id});
    expect(recoveredFoo).toBeDefined();
    expect(recoveredFoo.transaction_id).toEqual(transaction_id);
    expect(recoveredFoo.state).toEqual("final");
    // Check transaction
    var txDoc = tx.Transactions.findOne({_id: transaction_id});
    expect(txDoc.items[0].state).toEqual("done");
    expect(txDoc.items[1].state).toEqual("done");
    expect(txDoc.state).toEqual("done");
    
  })
})

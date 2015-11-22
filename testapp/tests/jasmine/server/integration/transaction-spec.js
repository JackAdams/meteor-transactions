'use strict';

/**
 * Tests that a transaction is recorded in the database with
 * the correct values in the correct fields
 */

describe('committed transaction documents', function () {
    
  var transaction_id, insertedFooDoc, transactionDoc, fakeId;

  beforeEach(function () {
    
    // Fake userId to get through tx userId checks
    fakeId = 'or6YSgs6nT8Bs5o6p';
    
    // Because `tx.requireUser = true` (by default)
    spyOn(Meteor,'userId').and.returnValue(fakeId);

    tx.start('transaction check');
    var newId = fooCollection.insert(
      {foo: "After insert"}, {tx: true, instant: true});
    fooCollection.update({_id: newId}, {$set: {foo: "After update"}}, {tx: true});
    tx.commit();
    insertedFooDoc = fooCollection.findOne({_id: newId});
    expect(insertedFooDoc.transaction_id).toBeDefined();
    transaction_id = insertedFooDoc.transaction_id;
    transactionDoc = tx.Transactions.findOne({_id:transaction_id});
    expect(transactionDoc).toBeDefined();
  });

  afterEach(function () {
    fooCollection.remove({});
    tx.Transactions.remove({});
  });
 
  it ('should have the correct user_id', function () {;

    expect(transactionDoc.user_id).toEqual(fakeId);
    
  });
  
  it ('should have an array of items', function () {

    var items = transactionDoc.items;
    expect(items && (items.length > 0)).toBeTruthy();
 
  });
  
  it('should have a context that is an object', function () {
     
    expect(_.isObject(transactionDoc.context)).toBeTruthy();
      
  });

});
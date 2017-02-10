'use strict';

describe('upsert', function () {
    
  var fakeId;

  beforeEach(function () {
    
    // Fake userId to get through tx userId checks
    fakeId = 'or6YSgs6nT8Bs5o6p';
    
    // Because `tx.requireUser = true` (by default)
    spyOn(Meteor,'userId').and.returnValue(fakeId);
  });

  afterEach(function () {
    fooCollection.remove({});
    tx.Transactions.remove({});
  });
 
  it ('should throw an exception', function () {
    expect(function() { fooCollection.upsert({_id: "myId"}, {$set: {a: 1}}, {tx: true}); }).toThrowError(/does not support upsert/);
  });

});

'use strict';

describe('instant remove undo test', function () {
    
  var fooId, fakeId;

  beforeEach(function () {
    
    // Fake userId to get through tx userId checks
    fakeId = 'or6YSgs6nT8Bs5o6p';
    
    // Because `tx.requireUser = true` (by default)
    spyOn(Meteor,'userId').and.returnValue(fakeId);

    fooId = fooCollection.insert({foo: "foo"});
    tx.start();
    fooCollection.remove(fooId, {tx: true, instant: true});
    tx.commit();
    tx.undo();
    tx.start();
    fooCollection.remove(fooId, {tx: true, instant: true});
    tx.commit();
  });

  afterEach(function () {
    fooCollection.remove({});
    tx.Transactions.remove({});
  });
 
  it ('should have been deleted the second time', function () {;
    expect(fooCollection.findOne(fooId)).toBeUndefined();
  });

});
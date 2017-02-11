'use strict';

describe('commit', function () {
    
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
 
  it ('with `rethrowCommitError` should throw an exception', function () {
	// We force the exception by doing a duplicate insert
	var docToInsert = {_id: 'predefined-id', foo: true};
	fooCollection.insert(docToInsert);
    expect(function() { fooCollection.insert(docToInsert, {tx: true, rethrowCommitError: true}); }).toThrowError(/An error occurred, so transaction was rolled back/);
  });

});

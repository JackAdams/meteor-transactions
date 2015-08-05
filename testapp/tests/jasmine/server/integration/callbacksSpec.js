'use strict';

/**
 * Tests that a callback passed in a commit
 * returns the _id values of inserted items
 */

describe('commit callback', function() {
    
  var context, error, result, fakeUserId, newId;

  beforeEach(function() {  
        
    // Fake userId to get through tx userId checks
    fakeUserId = 'or6YSgs6nT8Bs5o6p';
    
    // Because `tx.requireUser = true` (by default)
    spyOn(Meteor,'userId').and.returnValue(fakeUserId);
      
    tx.start('transaction with callback');
    newId = fooCollection.insert({foo: "foo"}, {tx: true, instant: true});
    fooCollection.update({_id: newId}, {$set: {foo: "bar"}}, {tx: true});
    tx.commit(function (err, res) {
      context = this;
      error = err;
      result = res;
    });
    
  });

  afterEach(function () {
    fooCollection.remove({});
    tx.Transactions.remove({});
  });

  it('should be called', function() {
    
    /*console.log('Callback context:', context);
    console.log('Callback error:', error);
    console.log('Callback result:', result);*/
    
    expect(result).toBeDefined();

  });

  it('should return _id values of inserted items', function() {
    
    var fooDoc = fooCollection.findOne({foo: {$exists: true}});
    expect(fooDoc._id).toEqual(result.fooCollection[0]);
    
  });

});

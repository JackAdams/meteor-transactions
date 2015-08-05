'use strict';

/**
 * Tests for support of Mongo collection updates with $addToSet
 */

describe('updates with $addToSet', function () {
  var transaction_id, insertedFooDoc;

  beforeEach(function () {
    // Fake userId to get through tx userId checks
    spyOn(Meteor,'userId').and.returnValue('or6YSgs6nT8Bs5o6p');

    tx.start('insert foo');
    fooCollection.insert(
      {foo: [{bar: 1}, {bar: 2}, {bar: 3}]}, {tx: true});
    tx.commit();

    insertedFooDoc = fooCollection.findOne({foo: {$exists: true}});
    expect(insertedFooDoc.transaction_id).toBeDefined();
    transaction_id = insertedFooDoc.transaction_id; 
  });

  afterEach(function () {
    fooCollection.remove({});
    tx.Transactions.remove({});
  });
 
  it ('can be updated with $addToSet modifier', function () {
    // SETUP
    // EXECUTE
    tx.start('update foo');
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $addToSet: {
          foo: {
            bar: 4
          }
        }
      },
      {
        tx: true
      });
    tx.commit();
    // VERIFY
    var fooCursor = fooCollection.find(
    {foo: {$elemMatch: {bar: 4}}});
    expect(fooCursor.count()).toBe(1);
    var recoveredFoo = fooCursor.fetch()[0];
    // Check transaction
    var txDoc = tx.Transactions.findOne({_id: recoveredFoo.transaction_id});
    expect(txDoc.items[0].inverse).toEqual(
      { command: '$pull', data: [ { key: 'foo', value: { json: '{"bar":4}' } } ] }
      );
    
  })

  it ('can be updated with $addToSet modifier and then undone and redone', function () {
    // SETUP
    tx.start('update foo');
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $addToSet: {
          foo: {
            bar: 4
          }
        }
      },
      {
        tx: true
      });
    tx.commit();

    // EXECUTE
    tx.undo();

    // VERIFY
    var fooCursor = fooCollection.find(
    {foo: {bar: 4}});
    expect(fooCursor.count()).toBe(0);

    // EXECUTE
    tx.redo();
    // VERIFY
    // 
    var fooCursor = fooCollection.find(
      {foo: {bar: 4}});
    expect(fooCursor.count()).toBe(1);
    
  })


  it ('can be updated with $addToSet modifier using $each', function () {
    // SETUP
    var newBars = [{bar: 4}, {bar: 5}];

    // EXECUTE
    tx.start('update foo');
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $addToSet: {
          foo: {$each: newBars}
        }
      },
      {tx: true});
    tx.commit();
    
    // VERIFY
    var fooCursor = fooCollection.find(
      {foo: {bar: 4}});
    expect(fooCursor.count()).toBe(1);      
    var recoveredFoo = fooCursor.fetch()[0];

    // Check transaction
    var txDoc = tx.Transactions.findOne({_id: recoveredFoo.transaction_id});
    expect(txDoc.items[0].update).toEqual({ command: '$addToSet', data: [ { key: 'foo', value: { json: '{"$each":[{"bar":4},{"bar":5}]}' } } ] });
  })

  it ('can be updated with $addToSet modifier using $each and then undone and redone', function () {
    // SETUP
    var originalInverseOperations = tx.inverseOperations.$addToSet;
    tx.inverseOperations.$addToSet = bruteForceAddToSetInverse;      
    var newBars = [{bar: 4}, {bar: 5}];
    tx.start('update foo');
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $addToSet: {
          foo: {$each: newBars}
        }
      },
      {tx: true});
    tx.commit();

    // EXECUTE
    tx.undo();

    // VERIFY
    var fooCursor = fooCollection.find(
      {foo: {bar: 4}});
    expect(fooCursor.count()).toBe(0);      

    // EXECUTE
    tx.redo();

    // VERIFY
    var fooCursor = fooCollection.find(
      {foo: {bar: 4}});
    expect(fooCursor.count()).toBe(1);      

    // TEARDOWN
    tx.inverseOperations.$addToSet = originalInverseOperations;
  })

  it ('can be updated with $addToSet modifier with multiple fields', function () {
    // SETUP
    var newBars = [{bar: 4}, {bar: 5}];

    // EXECUTE
    tx.start('update foo');
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $addToSet: {
          foo: {$each: newBars},
          fooBar: {fooBar: 1}
        }
      },
      {tx: true});
    tx.commit();

    // VERIFY
    var fooCursor = fooCollection.find(
      {foo: {bar: 4}});
    expect(fooCursor.count()).toBe(1);      
    var recoveredFoo = fooCursor.fetch()[0];
    expect(recoveredFoo.fooBar).toEqual([{fooBar: 1}]);
    // Check transaction
    var txDoc = tx.Transactions.findOne({_id: recoveredFoo.transaction_id});
    expect(txDoc.items[0].update).toEqual({ command: '$addToSet', data: [ { key: 'foo', value: { json: '{"$each":[{"bar":4},{"bar":5}]}' } }, { key: 'fooBar', value: { json: '{"fooBar":1}' } } ] });
    expect(txDoc.items[0].inverse).toEqual({ command: '$pull', data: [ { key: 'foo', value: { json: '{"$each":[{"bar":4},{"bar":5}]}' } }, { key: 'fooBar', value: { json: '{"fooBar":1}' } } ] });
  });

  describe('with brute force inverse operation', function () {
    var originalInverseOperations = tx.inverseOperations.$addToSet;

    beforeEach(function() {
      // Switch tx.inverseOperations.$addToSet function
      originalInverseOperations = tx.inverseOperations.$addToSet;
      tx.inverseOperations.$addToSet = bruteForceAddToSetInverse;      
    });

    afterEach(function() {
      // Restore original tx.inverseOperations.$addToSet function
      tx.inverseOperations.$addToSet = originalInverseOperations;
    })

    it ('can be updated with $addToSet modifier with multiple fields and then undone and redone', function () {
      // SETUP
      var newBars = [{bar: 4}, {bar: 5}];
      tx.start('update foo');
      fooCollection.update(
        {_id: insertedFooDoc._id},
        {
          $addToSet: {
            foo: {$each: newBars},
            fooBar: {fooBar: 1}
          }
        },
        {tx: true});
      tx.commit();

      // EXECUTE
      tx.undo();

      // VERIFY
      var fooCursor = fooCollection.find(
        {foo: {bar: 4}, fooBar: []});
      expect(fooCursor.count()).toBe(0);

      // EXECUTE
      tx.redo();

      fooCursor = fooCollection.find(
        {foo: {bar: 4}});
      expect(fooCursor.count()).toBe(1);      
      var recoveredFoo = fooCursor.fetch()[0];
      expect(recoveredFoo.fooBar).toEqual([{fooBar: 1}]);
     
    });


  })

  it ('can be updated with $addToSet and $set modifiers', function () {
    // SETUP
    // EXECUTE
    tx.start('update foo');
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $addToSet: {
          foo: {
            bar: 4
          }
        },
        $set: {
          fooBar: 'barFoo'
        }
      },
      {
        tx: true
      });
    tx.commit();
    
    // VERIFY
    var fooCursor = fooCollection.find(
    {foo: {$elemMatch: {bar: 4}}});
    expect(fooCursor.count()).toBe(1);
    var recoveredFoo = fooCursor.fetch()[0];
    expect(recoveredFoo.fooBar).toEqual('barFoo');

    // Check transaction
    var txDoc = tx.Transactions.findOne({_id: recoveredFoo.transaction_id});
    expect(txDoc.items.length).toBe(2);
    expect(txDoc.items[0].inverse).toEqual(
      { command: '$pull', data: [ { key: 'foo', value: { json: '{"bar":4}' } } ] }
      );
    expect(txDoc.items[1].inverse).toEqual(
      {"command":"$unset","data":[{"key":"fooBar","value":""}]}
      );
  })

  it ('can be updated with $addToSet and $set modifiers then undone and redone', function () {
    // SETUP
    tx.start('update foo');
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $addToSet: {
          foo: {
            bar: 4
          }
        },
        $set: {
          fooBar: 'barFoo'
        }
      },
      {
        tx: true
      });
    tx.commit();

    // EXECUTE
    tx.undo();

    // VERIFY
    var fooCursor = fooCollection.find(
    {foo: {bar: 4}, fooBar: 'barFoo'});
    expect(fooCursor.count()).toBe(0);

    // EXECUTE
    tx.redo();

    // VERIFY
    var fooCursor = fooCollection.find(
    {foo: {bar: 4}, fooBar: 'barFoo'});
    expect(fooCursor.count()).toBe(1);

   })

});
   

function bruteForceAddToSetInverse (collection, existingDoc, updateMap, opt) {
  // Function to use $set or $unset to restore original state of updated fields
  var self = this, inverseCommand = '$set', formerValues = {};
  // Brute force approach to ensure previous array is restored on undo
  // even if $addToSet uses sub-modifiers like $each / $slice
  // console.log('existingDoc:'+JSON.stringify(existingDoc));
  _.each(_.keys(updateMap), function (keyName) {
    var formerVal = self._drillDown(existingDoc,keyName);
     if (typeof formerVal !== 'undefined') {
      formerValues[keyName] = formerVal;
     } else {
      // Reset to empty array. Really should be an $unset but cannot mix inverse actions
      formerValues[keyName] = [];
     }
  })
  return {command:inverseCommand,data:formerValues};
};
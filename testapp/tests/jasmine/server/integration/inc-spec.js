'use strict';

/**
 * Tests for support of Mongo collection updates with $inc
 */

describe('updates with $inc', function () {
  var transaction_id, insertedFooDoc;

  beforeEach(function () {
    // Fake userId to get through tx userId checks
    spyOn(Meteor,'userId').and.returnValue('or6YSgs6nT8Bs5o6p');

    tx.start('insert foo');
    fooCollection.insert(
      {foo: [{bar: 1}, {bar: 2}, {bar: 3}], baz: 1}, {tx: true});
    tx.commit();

    insertedFooDoc = fooCollection.findOne({foo: {$exists: true}});
    expect(insertedFooDoc.transaction_id).toBeDefined();
    transaction_id = insertedFooDoc.transaction_id; 
  });

  afterEach(function () {
    fooCollection.remove({});
    tx.Transactions.remove({});
  });
 
  it ('can be updated with $inc modifier', function () {
    // SETUP
    // EXECUTE
    tx.start('update foo');
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $inc: {
          baz: 1
        }
      },
      {
        tx: true
      });
    tx.commit();
    
    // VERIFY
    var recoveredFoo = fooCollection.findOne(
    {_id: insertedFooDoc._id});
    expect(recoveredFoo.baz).toEqual(2);
    // Check transaction
    var txDoc = tx.Transactions.findOne({_id: recoveredFoo.transaction_id});
    expect(txDoc.items[0].inverse).toEqual(
      { command: '$set', data: [ { key: 'baz', value: 1 } ] }
      );
    
  })
  
  it ('works for nested fields', function () {
    // SETUP
    // EXECUTE
    tx.start('update foo');
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $inc: {
          "foo.0.bar": 2
        }
      },
      {
        tx: true
      });
    tx.commit();
    
    // VERIFY
    var recoveredFoo = fooCollection.findOne(
    {_id: insertedFooDoc._id});
    expect(recoveredFoo.foo[0].bar).toEqual(3);
    // Check transaction
    var txDoc = tx.Transactions.findOne({_id: recoveredFoo.transaction_id});
    expect(txDoc.items[0].inverse).toEqual(
      { command: '$set', data: [ { key: 'foo.0.bar', value: 1 } ] }
      );
    
  })

  it ('can be updated with $inc modifier then undone and redone', function () {
    // SETUP
	
    tx.start('update foo');
    fooCollection.update(
      {_id: insertedFooDoc._id},
      {
        $inc: {
          baz: 2
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
    {baz: 1});
    expect(fooCursor.count()).toBe(1);

    // EXECUTE
    tx.redo();

    // VERIFY 
    fooCursor = fooCollection.find(
      {baz: 3});
    expect(fooCursor.count()).toBe(1);
    
  })
})

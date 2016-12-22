'use strict';

describe('committable actions', function () {

  var transaction_id, insertedFooDoc, transactionDoc, fakeId;

  beforeEach(function () {

    // Fake userId to get through tx userId checks
    fakeId = 'or6YSgs6nT8Bs5o6p';

    // Because `tx.requireUser = true` (by default)
    spyOn(Meteor,'userId').and.returnValue(fakeId);

  });

  it('insert with pre-defined document _id', function () {
    // SETUP
    var predefinedId = 'PNAJ67oTkkaH46xJz';
    tx.start('insert transaction');
    var origDoc = {_id: predefinedId, foo: "After insert"};
    var insertDoc = _.clone(origDoc);
    fooCollection.insert(insertDoc, {tx: true});

    // EXECUTE
    tx.commit();

    // VERIFY
    var savedDoc = fooCollection.findOne({_id: predefinedId});

    expect(savedDoc).toBeDefined();
    expect(savedDoc.foo).toEqual('After insert');
    // Collection.insert should not mutate its argument.
    expect(insertDoc).toEqual(origDoc);
  });


  it ('update previously null property', function () {

    // SETUP
    tx.start('insert transaction');
    fooCollection.insert(
      {foo: 'inserted', bar: null}, {tx: true});
    tx.commit();

    var savedDoc = fooCollection.findOne({foo: 'inserted'});
    expect(savedDoc).toBeDefined();
    expect(savedDoc._id).not.toBeNull();
    // EXECUTE
    tx.start('update transaction');
    fooCollection.update({_id: savedDoc._id}, {
      $set: {
        bar: 'updated'
      }
    },
    {
      tx: true
    });
    tx.commit();

    // VERIFY
    var updatedDoc = fooCollection.findOne({_id: savedDoc._id});
    expect(updatedDoc).toBeDefined();
    expect(updatedDoc.bar).toEqual('updated');

  })

  afterEach(function () {
    fooCollection.remove({});
    tx.Transactions.remove({});
  });

});
'use strict';

describe('Use custom checkPermission check', function () {

  var transaction_id, insertedFooDoc, transactionDoc, fakeId;

  beforeEach(function () {

    // Fake userId to get through tx userId checks
    fakeId = 'or6YSgs6nT8Bs5o6p';

    // Because `tx.requireUser = true` (by default)
    spyOn(Meteor,'userId').and.returnValue(fakeId);

    tx.checkPermission =  function(action, collection, doc, modifier) {
      // console.log('doc'+JSON.stringify(doc));
      if (action === 'insert') {
        expect(doc).toBeDefined();
      }
      return true;
    }

  });

  it('calls custom checkPermission', function () {
    tx.start('transaction check');
    var newId = fooCollection.insert(
      {foo: "After insert"}, {tx: true});
    tx.commit();
  });

  afterEach(function () {
    fooCollection.remove({});
    tx.Transactions.remove({});
  });


})
'use strict';

/**
 * Performing a transaction with overridePermissionCheck on the client
 * should fail
 */

describe('overridePermissionCheck on client', function() {
	
	var fakeUserId, barId, originalBarId, txid, insertedDoc;
	  
	originalBarId = "asdfasdf33gwer43";

	beforeEach(function() {  
		  
	  // Fake userId to get through tx userId checks
	  fakeUserId = 'or6YSgs6nT8Bs5o6p';
	  
	  // Because `tx.requireUser = true` (by default)
	  spyOn(Meteor,'userId').and.returnValue(fakeUserId);
	  barCollection.remove({_id: originalBarId});
	  
	});
	
	afterEach(function() {  
		  
	  barCollection.remove({_id: originalBarId});
	  var transactionDoc = tx.Transactions.findOne();
	  if (transactionDoc) {
	    tx.Transactions.remove({_id: transactionDoc._id});
	  }
	  
	});
	
	it('should be denied by the server', function (done) {
      
	  txid = tx.start('transaction with {overridePermissionCheck: true}');
	  expect(txid).toBeDefined();
	  // This insert is not instant, so it's not going through allow and deny rules
	  // Also, we don't get an _id value back immediately
	  barId = barCollection.insert({_id: originalBarId, foo: "foo", denyMePermissionOnTheServer: true}, {tx: true, overridePermissionCheck: true});
	  expect(barId).toBeDefined();
	  expect(barId).toEqual(originalBarId);
	  var result = null;
	  tx.commit(function (err, res) {
		/*console.log("Results:", err, res);
		console.log("barId:", barId);
		console.log("res.barCollection:", res.barCollection);*/
		expect(err).toBeDefined();
		expect(res).toEqual(false);
		// There should be no document in the client's minimongo
		insertedDoc = barCollection.findOne({_id: barId});
		// console.log("insertedDoc:", insertedDoc);
		expect(insertedDoc).toEqual(undefined);
		done();
	  });

    });
	
});

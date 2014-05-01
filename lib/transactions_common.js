// API Examples
//
// tx.insert(Posts,{field:value,field2:value2});
//
//
// tx.start();
// _.each(newUsers, function(user) {
//   tx.insert(Users,user); // Where user is an object
// });
// tx.commit();
//
//
// tx.remove(Posts,_id);
//
//
// tx.update(Posts,_id,{field1:value1,field2:value2});

(function() {
	
  Transactions = new Meteor.Collection("transactions");
  
  Transactions.allow({
	insert: function(userId,doc) { return (_.has(doc,"items") || doc.user_id !== userId) ? false : true; },
	update: function(userId, doc, fields, modifier) { 
	  if (userId !== doc.user_id) {
		return false;
	  }
	  else {
		if (tx.checkTransactionFields(modifier)) {
		  return true;
		}
		else {
		  Transactions.remove({_id:doc._id});
		  return false; 
		}
	  }
	},
	remove: function(userId,doc) { return true; }
  });
  
  var Transact = function() {
	this._transaction_id = null;
	this._autoTransaction = false;
	this._executionStack = [];
	this._items = {};
	this._startAttempts = 0;
	this._granted = {};
	this._rollback = false;
	this._context = {};
	this._inverseOps = {
	  '$set' : '$set',
	  '$addToSet' : '$pull',
	  '$unset' : '$set',
	  '$pull' : '$addToSet'	
	}
	this._permissionOverrideToken = '';
	this.permissionCheck = function(command,collection,doc,modifier) { return true; }; // actions are "insert", "update", "remove"
	this.makeContext = function(command,collection,doc,modifier) { return doc; };
	this.undoTimeLimit = 5 * 60 * 1000; // Publish user's transactions from the last five minutes (publication not reactive)
	this.onTransactionExpired = function() {alert('Sorry. Other edits have been made, so this action can no longer be reversed.');}; // Called when a transaction expires
	
	// You MUST overwrite this to make the undo and redo stack work, using:
	// tx.collectionIndex = {posts:Posts,comments:Comments, etc...}
	// where the key is the name of the collection you'll be using in transaction calls and the value is the actual Meteor.Collection
	this.collectionIndex = {};
	
	// You can overwrite this optionally
	// e.g. to allow updates to be made to a post by an unauthorized user (e.g. to update a denormalized comment count on the post document), provided the user has been authorized to insert or remove a comment 
	// the above scenario would look like: this.confer = {"update posts": ["insert comments","remove comments"]}
	this.confer = {};
  }
  
  Transact.prototype.start = function(description) {
	if (!this._transaction_id) {
	  if (typeof description === 'undefined') {
		description = 'last action';  
	  }
	  this._transaction_id = Transactions.insert({user_id:Meteor.userId(),timestamp:(new Date).getTime(),description:description});
	  console.log('Start transaction_id: ' + this._transaction_id + ' (auto: ' + this._autoTransaction + ')');
	  return this._transaction_id;
	}
	else {
	  this._startAttempts++;
	  return false;	
	}
  }
  
  Transact.prototype.transactionOpen = function() {
	return !!this._transaction_id;  
  }
  
  Transact.prototype.commit = function(txid) {
	if (!this._transaction_id) {
	  this._cleanReset();
	  console.log("Commit reset transaction to clean state");
	  return;	
	}
	if (typeof txid !== 'undefined' && txid !== this._transaction_id) {
	  if (txid === null) {
		console.log("Forced commit");
	  }
	  else {
	    this._startAttempts--;
	    return;
	  }
	}
	if (this._startAttempts > 0 && !(typeof txid !== 'undefined' && (txid === this._transaction_id || txid === null))) {
	  this._startAttempts--;
	  return;	
	}
	if (_.isEmpty(this._items) && _.isEmpty(this._executionStack)) { // Have to do both checks in case of instant inserts that put nothing on this._executionStack but add to this._items
	  // Don't record the transaction if nothing happened
	  Transactions.remove({_id:this._transaction_id}); console.log('Empty transaction removed: ' + this._transaction_id);
	}
	else if (this._rollback) {
	  // One or more permissions failed, don't exectute the others
	  this.rollback();
	}
	else {
	  console.log('Beginning commit with transaction_id: ' + this._transaction_id);
	  // console.log("Items in the stack: ",this._executionStack);
	  try {
		// It would be good to update the database with the info about what we're going to try before trying it, so if there's a fatal error we can take a look at what might have caused it
		// However, that data's not available until after the items on the exectution stack have been executed
		while(this._executionStack.length) {
		  this._executionStack.shift().call();  
		}
		Transactions.update({_id:this._transaction_id},{$set:_.extend({context:this._context},{items:this._items})});
	  }
	  catch(err) {
		console.log(err);
		console.log("Rolling back changes");
		this.rollback();
		return; 
	  }
	}
	this._cleanReset(); console.log("Commit reset transaction to clean state");
  }
  
  Transact.prototype.rollback = function() { // TODO -- this function is basically a copy of the undo function further down this script -- they should be DRYed out
	// Need to undo all the instant stuff that's been done
	var self = this;
	var items = this._items;
	try {
	  if (_.isArray(items.removed)) {
		_.each(items.removed, function(obj) {
		  if (obj.instant) {
			tx.collectionIndex[obj.collection].update({_id:obj._id},{$unset:{deleted:1,transaction_id:1}});
		  }
		});
	  }
	  if (_.isArray(items.updated)) {
		_.each(items.updated, function(obj) {// console.log("Undoing update: ", obj);
		  if (obj.instant && typeof obj.inverse !== 'undefined' && obj.inverse.command && obj.inverse.data) {
			var operation = {};
			operation[obj.inverse.command] = self._unpackageForUpdate(obj.inverse.data); // console.log(operation);
			tx.collectionIndex[obj.collection].update({_id:obj._id},operation);
		  }
		});
	  }
	  if (_.isArray(items.inserted)) {
		_.each(items.inserted, function(obj) {
		  if (obj.instant) {
			var sel = {_id:obj._id};
			// This transaction_id check is in case the document has been subsequently edited -- in that case, we don't want it removed from the database completely
			sel.transaction_id = self._transaction_id;
			tx.collectionIndex[obj.collection].remove(sel);
		  }
		});
	  }
	}
	catch(err) {
	  console.log(err);
	  console.log("Rollback failed -- you'll need to check your database manually for corrupted records.");
	  console.log("Here is a log of the actions that were tried and their inverses:");
	  console.log("(it was probably one of the inverse actions that caused the problem here)");
	  console.log(items);	
	}
	self._cleanReset();
	console.log("Rollback reset transaction to clean state");
  }
  
  Transact.prototype._cleanReset = function() {
	this._transaction_id = null;
	this._autoTransaction = false;
	this._items = {};
	this._executionStack = [];
	this._startAttempts = 0;
	this._granted = {};
	this._rollback = false;
	this._context = {};
	this._permissionOverrideToken = '';
  }
  
  Transact.prototype.insert = function(collection,newDoc,opt) {
	if (this._rollback) {
	  return;	
	}
	// NOTE: "collection" is the collection object itself, not a string
	if (this._permissionCheckOverridden(opt) || this._permissionCheck("insert",collection,newDoc,{})) {
	  var self = this;
	  this._openAutoTransaction('add ' + collection._name.slice(0, - 1));
	  self._setContext(self.makeContext('insert',collection,newDoc,{}));
	  if ((typeof opt !== 'undefined' && opt.instant) || this._autoTransaction) {
		try {
		  var newId = collection.insert(_.extend(newDoc,{transaction_id:self._transaction_id}));
		  self._pushToRecord("inserted",collection,newId,{newDoc:newDoc},true); // true is to mark this as an instant change
		  this._closeAutoTransaction();
		  console.log("Executed instant insert");
		  return newId
		}
		catch(err) {
		  console.log(err);
		  console.log("Rollback initiated by instant insert command");
		  this._rollback = true;
		}
	  }
	  this._executionStack.push(function() {
		var newId = collection.insert(_.extend(newDoc,{transaction_id:self._transaction_id}));
		self._pushToRecord("inserted",collection,newId,{newDoc:newDoc});
		console.log("Executed insert");
	  });
	  console.log("Pushed insert command to stack: " + this._transaction_id); //  + ' (Auto: ' + this._autoTransaction + ')'
	  this._closeAutoTransaction();
	}
	else {
	  this._rollback = true;
	  return new Meteor.Error(403,"Insufficient permissions","insert document into " + collection._name); // Permission to insert not granted	
	}
  }
  
  Transact.prototype.remove = function(collection,doc,opt) {
	// Remove any document with a field that has this val
	// NOTE: "collection" is the collection object itself, not a string
	if (this._rollback) {
	  return;	
	}
	var _id = (_.isObject(doc)) ? doc._id : doc;
	var existingDoc = (!_.isObject(doc)) ? collection.findOne({_id:doc}) : doc;
	if (this._permissionCheckOverridden(opt) || this._permissionCheck("remove",collection,existingDoc,{})) {
	  var self = this;
	  this._openAutoTransaction('remove ' + collection._name.slice(0, - 1));
	  var sel = {_id:_id};
	  if (Meteor.isServer) {
		sel.deleted = {$exists: false}; // Can only do removes on client using a simple _id selector
	  }
	  self._setContext(self.makeContext('remove',collection,existingDoc,{}));
	  if (opt && opt.instant) {
		try {
		  self._pushToRecord("removed",collection,_id,null,true); // null is for field data (only used for updates) and true is to mark this as an instant change
		  collection.update(sel,{$set:{deleted:(new Date).getTime(),transaction_id:self._transaction_id}});
		  console.log("Executed instant remove");
		}
		catch(err) {
		  console.log(err);
		  console.log("Rollback initiated by instant remove command");
		  this._rollback = true;
		}
	  }
	  else {
		this._executionStack.push(function() {
		  self._pushToRecord("removed",collection,_id);
		  collection.update(sel,{$set:{deleted:(new Date).getTime(),transaction_id:self._transaction_id}});
		  console.log('Executed remove');
		});
		console.log("Pushed remove command to stack: " + this._transaction_id); //  + ' (Auto: ' + this._autoTransaction + ')'
	  }
	  this._closeAutoTransaction();
	  return true; // Removal happened
	}
	else {
	  this._rollback = true;
	  return new Meteor.Error(403,"Insufficient permissions","remove document from " + collection._name); // Permission to remove not granted
	}
  }
  
  Transact.prototype.update = function(collection,doc,updates,opt) {
	// NOTE: "field" should be of the form {$set:{field:value}}, etc.
	// NOTE: "collection" is the collection object itself, not a string
	if (this._rollback) {
	  return;	
	}
	var self = this;
	var _id = (_.isObject(doc)) ? doc._id : doc;
	var existingDoc = (!_.isObject(doc)) ? collection.findOne({_id:_id}) : doc;
	if (this._permissionCheckOverridden(opt) || this._permissionCheck("update", collection, existingDoc, updates)) {
	  this._openAutoTransaction('update ' + collection._name.slice(0, - 1));
	  var actionFields = _.pairs(updates); // console.log(actionField);
	  var actionFieldsCount = actionFields.length;
	  for (var i = 0; i < actionFieldsCount; i++) {
		var command = actionFields[i][0];
		var updateMap = actionFields[i][1];
		if (typeof opt === 'undefined' || typeof opt.inverse === 'undefined') {
		  // This "opt.inverse" thing is only used if you need to define some tricky inverse operation, but will probably not be necessary in practice
		  // a custom value of opt.inverse needs to be an object of the form:
		  // {command:"$set",data:{fieldName:value}}
		  // var fieldName = _.keys(actionField[0][1])[0]; // console.log(fieldName);
		  if (typeof opt === 'undefined') {
			opt = {};	
		  }
		  var inverseCommand = this._inverseOps[command];
		  var formerValues = {};
		  switch (inverseCommand) { // In case we need to do something special to make the inverse happen
			case '$unset' :
			case '$set' :
			  _.each(_.keys(updateMap), function(keyName) {
				var formerVal = self.drillDown(existingDoc,keyName);
				if (typeof formerVal !== 'undefined') {
				  formerValues[keyName] = formerVal;
				}
				else {
				  inverseCommand = '$unset';
				  formerValues[keyName] = '';
				}
			  });
			  break;
			case '$pull' :
			  // TODO
			  formerValues = updateMap;
			  break;
			case '$push' :
			  // TODO
			  formerValues = updateMap;
			  break;
			case '$pullAll' :
			  // TODO
			  break;
			case '$pushAll' :
			  // TODO
			  break;
			default :
			  formerValues = updateMap;
			  break;
		  }
		  opt.inverse = opt.inverse || {command:inverseCommand,data:formerValues}; // console.log("inverse op: ",sel);
		}
		self._setContext(self.makeContext('update',collection,existingDoc,updates));
		var updateData = {command:command, data:updateMap};
		if (opt && opt.instant) {
		  try {
		    makeUpdate(collection,_id,updates,updateData,opt.inverse,true);
			console.log("Executed instant update"); // true param is to record this as an instant change
		  }
		  catch(err) {
			console.log(err);
			console.log("Rollback initiated by instant update command");
			this._rollback = true;
		  }
		}
		else {
		  this._executionStack.push(function() {
			makeUpdate(collection,_id,updates,updateData,opt.inverse);
			console.log("Executed update");
		  });
		  console.log("Pushed update command to stack: " + this._transaction_id); //  + ' (Auto: ' + this._autoTransaction + ')'
		}
	  }
	  this._closeAutoTransaction();
	  return;
	}
	else {
	  this._rollback = true;
	  return new Meteor.Error(403,"Insufficient permissions","update document in " + collection._name); // Permission to update not granted
	}
	
	function makeUpdate(collection,_id,updates,updateData,inverseData,instant) {
	  if (_.isObject(updates["$set"])) {
		_.extend(updates["$set"], {transaction_id:self._transaction_id});
	  }
	  else {
		updates["$set"] = {transaction_id:self._transaction_id};
	  }
	  collection.update({_id:_id},updates);
	  delete updates["$set"].transaction_id;
	  self._pushToRecord("updated",collection,_id,{update:self._packageForStorage(updateData),inverse:self._packageForStorage(inverseData)},instant);
	}
	
  }
  
  Transact.prototype.cancel = function() {
	this._rollback = true;
  }
  
  Transact.prototype.undo = function() {
	var self = this;
	Meteor.call("_meteorTransactionsUndo", function(err,res) {
	  if (Meteor.isClient && res) {
		self.onTransactionExpired.call();
	  }
	});
  }
  
  Transact.prototype.redo = function() {
	var self = this;
	Meteor.call("_meteorTransactionsRedo", function(err,res) {
	  if (Meteor.isClient && res) {
		self.onTransactionExpired.call();  
	  }
	});
  }
  
  Transact.prototype.checkTransactionFields = function (modifier) {
   // Iterate over all the items that are going to be stored on the transaction stack and check their legitimacy
   var self = this,details,recombinedFields = {};
   var fields = modifier["$set"];
   if (!fields) {
	 return false;
   }
   var items = fields.items;
   if (!items || _.isEmpty(items)) {
	 return false; 
   }
   var action,collection,doc, fail = false;
   _.each(items,function(val,key) {
	 _.each(val, function(value) {
	   if (value.update) {
		 action = 'update';
		 details = value.update;
	     recombinedFields[details.command] = self._unpackageForUpdate(details.data);
	   }
	   else if (value.insert) {
		 action = 'insert';  
	   }
	   else if (value.remove) {
		 action = 'remove';   
	   }
	   collection = value.collection;
	   doc = self.collectionIndex[collection].findOne({_id:value._id});
	   if (!self._permissionCheck(action,self.collectionIndex[collection],doc,recombinedFields)) {
		 fail = true;
	   }
	 });
   });
   this._cleanReset(); // console.log("Fail: ",fail);
   return !fail;
  }
  
  Transact.prototype._openAutoTransaction = function(description) {// console.log("Auto open check value for transaction_id: " + this._transaction_id + ' (Auto: ' + this._autoTransaction + ')');
	if (!this._transaction_id) {
	  this._autoTransaction = true;
	  this.start(description);
	  // console.log("Auto opened: " + this._transaction_id + ' (Auto: ' + this._autoTransaction + ')');
	}
  }
  
  Transact.prototype._closeAutoTransaction = function() {// console.log("Auto commit check value for autoTransaction: " + this._autoTransaction + ' (Auto: ' + this._autoTransaction + ')');
	if (this._autoTransaction) {
	  console.log("Auto committed: " + this._transaction_id + ' (Auto: ' + this._autoTransaction + ')');
	  this.commit();	
	}
  }
  
  Transact.prototype._pushToRecord = function(type, collection, _id, fieldData, instant) {
	var item = {collection:collection._name,_id:_id};
	if (typeof instant !== 'undefined' && instant) {
	  item.instant = true;	
	}
	if (typeof fieldData !== "undefined" && fieldData) {
	  _.extend(item, fieldData);	
	}
	if (typeof this._items[type] === 'undefined') {
	  this._items[type] = [];	
	}
	this._items[type].push(item);
  }
  
  Transact.prototype.getPermissionOverrideToken = function() {
	if (Meteor.isServer) {
	  this._permissionOverrideToken = Math.random().toString(36).slice(2);
	  return this._permissionOverrideToken;
	}
  }
  
  Transact.prototype._permissionCheckOverridden = function(opt) {
	return (Meteor.isServer && typeof opt !== 'undefined' && opt.overridePermissionCheck && this._permissionOverrideToken && opt.overridePermissionCheck == this._permissionOverrideToken);
  }
  
  Transact.prototype._permissionCheck = function(action,collection,doc,updates) { // insert and remove send null for "updates" param, but this is where all the specifics of the update are kept
    // Note the implications of the below implementation -- if one thing asked in a transaction has been given permission, everything with conferred permissions asked AFTER it automatically gets permission
	var key = action + " " + collection._name;
	if (this._granted[key] || _.intersection(_.keys(this._granted),this._confer(key)).length) {
	  this._granted[key] = true;
	  return true;
	}
	var granted = this.permissionCheck(action,collection,doc,updates);
	if (granted) {
	  this._granted[key] = true;
	}
	return granted;
  }
  
  Transact.prototype._confer = function(key) {
	return _.isArray(this.confer[key]) ? this.confer[key] : [this.confer[key]];
  }
  
  Transact.prototype._setContext = function(context) {
	_.extend(this._context,context);  
  }
  
  Transact.prototype._unpackageForUpdate = function(data) {
	// This turns the data that has been stored in an array of key-value pairs into an object that mongo can use in an update
	var objForUpdate = {};
	_.each(data, function(val) {
	  objForUpdate[val.key] = val.value;
	});
    return objForUpdate;
  }
  
  Transact.prototype._packageForStorage = function(update) {
	var arrForStorage = [];
	// This turns the data that is given as a mongo update into an array of key-value pairs that can be stored
	_.each(update.data, function(value,key) {
	  arrForStorage.push({key:key,value:value});
	});
	return {command:update.command,data:arrForStorage};
	
  }

  Transact.prototype.drillDown = function(obj,key) {
	var pieces = key.split('.');
	if (pieces.length > 1) {
	  var newObj = obj ? obj[pieces[0]] : {};
	  pieces.shift();
	  return Standbench.drillDown(newObj,pieces.join('.'));
	}
	else {
	  if (obj) {
		return obj[key];
	  }
	  else {
		return; // undefined	
	  }	
	}
  }
  
  tx = new Transact();
  
  Meteor.methods({
	
	'_meteorTransactionsUndo' : function() {
	  // Get the latest transaction done by this user and undo it
	  var expired = false;
	  var lastTransaction = Transactions.find({user_id:Meteor.userId(), $or:[{undone:null}, {undone:{$exists: false}}], expired: {$exists: false}}, {sort: {timestamp: -1}, limit:1}).fetch()[0];
	  if (lastTransaction && typeof lastTransaction.items !== 'undefined') {
		if (_.isArray(lastTransaction.items.removed)) {
		  _.each(lastTransaction.items.removed, function(obj) {	
			tx.collectionIndex[obj.collection].update({_id:obj._id},{$unset:{deleted:1,transaction_id:1}});
		  });
		}
		if (_.isArray(lastTransaction.items.updated)) {
		  _.each(lastTransaction.items.updated, function(obj) {// console.log("Undoing update: ", obj);
			if (typeof obj.inverse !== 'undefined' && obj.inverse.command && obj.inverse.data) {
			  var operation = {};
			  operation[obj.inverse.command] = tx._unpackageForUpdate(obj.inverse.data);// console.log(operation);
			  tx.collectionIndex[obj.collection].update({_id:obj._id},operation);
			}
		  });
		}
		if (_.isArray(lastTransaction.items.inserted)) {
		  _.each(lastTransaction.items.inserted, function(obj) {
			var sel = {_id:obj._id};
			// This transaction check is in case the document has been subsequently edited -- in that case, we don't want it removed from the database completely
			// Instead, we remove this transaction from the visible list by setting expired to true
			sel.transaction_id = lastTransaction._id;
			tx.collectionIndex[obj.collection].remove(sel);
			if (tx.collectionIndex[obj.collection].find({_id:obj._id}).count()) {
			  // Transaction has expired
			  Transactions.update({_id:lastTransaction._id},{$set:{expired:true}});
			  expired = true; // This is to tell the client that the transaction has expired and was not executed
			}
		  });
		}
		// After an undo, we need to remove that transaction from the stack
		if (!expired) {
		  Transactions.update({_id:lastTransaction._id},{$set:{undone:(new Date).getTime()}});
		}
	  }
	  else if (lastTransaction) {
		// Auto clean - this transaction is empty
		Transactions.remove({_id:lastTransaction._id});	
	  }
	  return expired;
	},
	
	'_meteorTransactionsRedo' : function() {
	  // Get the latest undone transaction by this user and redo it
	  var expired = false;
	  var lastUndo = Transactions.find({user_id:Meteor.userId(), undone:{$exists:true, $ne: null}, expired:{$exists:false}}, {sort: {undone: -1}, limit:1}).fetch()[0];
	  if (lastUndo && typeof lastUndo.items !== 'undefined') {
		if (_.isArray(lastUndo.items.removed)) {
		  _.each(lastUndo.items.removed, function(obj) {
			tx.collectionIndex[obj.collection].update({_id:obj._id},{$set:{deleted:(new Date).getTime(),transaction_id:lastUndo._id}});
		  });
		}
		if (_.isArray(lastUndo.items.updated)) {
		  _.each(lastUndo.items.updated, function(obj) {// console.log("Redoing update: ", obj);
			if (typeof obj.update !== 'undefined' && obj.update.command && obj.update.data) {
			  var operation = {};
			  operation[obj.update.command] = tx._unpackageForUpdate(obj.update.data);// console.log(operation);
			  tx.collectionIndex[obj.collection].update({_id:obj._id},operation);
			}
		  });
		}
		if (_.isArray(lastUndo.items.inserted)) {
		  _.each(lastUndo.items.inserted, function(obj) {
			if (!tx.collectionIndex[obj.collection].find({_id:obj._id}).count()) {
			  var newDoc = _.extend(obj.newDoc,{transaction_id:lastUndo._id,_id:obj._id});
			  tx.collectionIndex[obj.collection].insert(newDoc);
			}
			else {
			  // This is an edited doc that was not removed on last undo
			  // Transaction has expired
			  Transactions.update({_id:lastUndo._id},{$set:{expired:true}});
			  expired = true; // This is to tell the client that the transaction has expired and was not executed
			}
		  });
		}
		// After a redo, we need to add that transaction to the stack again
		if (!expired) {
		  Transactions.update({_id:lastUndo._id},{$unset:{undone:1}});
		}
	  }
	  return expired;
	}
	
  });

})();
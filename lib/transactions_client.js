// Transactions - undo/redo button subscriptions, helpers and event handlers

////////// Subscription //////////

Meteor.startup(function() {
  Tracker.autorun(function() {
    if (Meteor.userId()) {
      Meteor.subscribe('transactions');
    }
  });
});

////////// Undo and Redo buttons //////////

Template.undoRedoButtons.helpers({
	
  hideUndoButton : function() {
	return (!Transactions.find({$or:[{undone:null}, {undone:{$exists: false}}], expired: {$exists: false}}).count()) ? 'hide-undo-button' : '';
  },
  
  hideRedoButton : function() {
	return (!Transactions.find({undone: {$exists: true, $ne: null}, expired: {$exists: false}}).count()) ? 'hide-redo-button' : '';
  },
  
  action : function(type) {
	var existsOrNot = (type === 'redo') ? {undone:{$exists:true, $ne:null}} : {$or:[{undone:null}, {undone:{$exists: false}}]};
	var sorter = {};
	sorter[(type === 'redo') ? 'undone' : 'timestamp'] = -1;
	var transaction = Transactions.findOne(existsOrNot,{sort:sorter});
	return transaction && transaction.description;
  },
  
  class : function() {
	return _is.String(tx.undoRedoButtonClass) && tx.undoRedoButtonClass || '';
  }
  
});

Template.undoRedoButtons.events({
	
  'click #undo-button' : function() {
	tx.undo();	
  },
  
  'click #redo-button' : function() {
	tx.redo();	
  }
	
});
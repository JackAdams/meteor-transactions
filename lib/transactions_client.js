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
    return (Transactions.find({user_id:Meteor.userId(),$or:[{undone:null}, {undone:{$exists: false}}], expired: {$exists: false}}).count()) ? '' : 'hide-undo-button';
  },
  
  hideRedoButton : function() {
    return (Transactions.find({user_id:Meteor.userId(),undone: {$exists: true, $ne: null}, expired: {$exists: false}}).count()) ? '' : 'hide-redo-button';
  },
  
  action : function(type) {
    var sel = {user_id:Meteor.userId(), expired: {$exists: false}}; // This is for autopublish scenarios
    var existsOrNot = (type === 'redo') ? {undone:{$exists:true, $ne:null}} : {$or:[{undone:null}, {undone:{$exists: false}}]};
    var sorter = {};
    sorter[(type === 'redo') ? 'undone' : 'timestamp'] = -1;
    var transaction = Transactions.findOne(_.extend(sel,existsOrNot),{sort:sorter});
    return transaction && transaction.description;
  },
  
  undoRedoButtonclass : function() {
    return tx && _.isString(tx.undoRedoButtonClass) && tx.undoRedoButtonClass || '';
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
// TRANSACTIONS PUBLICATION

Meteor.startup(function() {
  Meteor.publish('transactions', function () {
    return Transactions.find({user_id: this.userId, timestamp: {$gt: ((new Date).getTime() - (tx.undoTimeLimit * 1000))}, expired:{$exists:false}}, {fields:{items:1,user_id:1,timestamp:1,undone:1,description:1}}, {sort: {timestamp: -1}});
  });
});
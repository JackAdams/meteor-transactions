Meteor + Mongo Transactions
===========================

### v1.x

- Explore Operational Transform options
- Look into support for `{multi: true}`
- Support for `upsert`
- Possible support for locking documents used in pending transactions

### v1.0

- Refactor and document code for better maintainability
- Add/improve support for other/existing mongo operators  
- Complete test coverage and security audit

### vNext

- More comprehensive test coverage

### v0.7.8

- Closes issues #49 (insert callbacks with collection2 not working) and #50 (undo of $set modifiers with multiple fields not restoring previous state correctly)

### v0.7.7

- Closes an issue (#48) in which Meteor.settings isn't defined for android builds and error gets thrown

### v0.7.6

- Closes an issue (#47) related to security, where transactions originating on the client could override the `tx.checkPermission` function on the server

### v0.7.5

- Fixes for a number of issues, the chief one being a broken rollback mechanism
- A small change in which auto committed insert transactions are not processed client side, but are sent to the server for writes, like  other transactions in `tx.start() ... tx.commit()` blocks, removing the need for allow/deny rules for inserts

### v0.7.0

- First release using new storage format for transactions and having db state recovery options

### v0.6.21

- Last stable(ish) release using naive/optimistic transactions with no db state recoverability
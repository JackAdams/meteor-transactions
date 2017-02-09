Meteor + Mongo Transactions
===========================

### v1.x [WILL NEED HELP]

- Explore Operational Transform options
- Look into support for `{multi: true}`
- Support for `upsert`
- Possible support for locking documents used in pending transactions

### v1.0 [PLANNED]

- Refactor and document code for better maintainability  
- Sufficient test coverage and security audit

### v0.9 [PLANNED]

- Add/improve support for other/existing mongo operators

----

### v0.8.0

- Refactored package internals to make it more robust when multiple transactions are happening concurrently

### v0.7.17

- Fixed a bug with logging (introduced in last update) which broke a few tests that went unnoticed
- Fixed bug in which `Collection.insert` was wrongly mutating the `newDoc` object being inserted
- Added `tx.getContext` method
- Added `tx.mergeContext` and `tx.setContextPathValue` methods for `lodash` users
- Changed absolute to relative symlink from the test app to the transactions package so everyone can run tests

### v0.7.16

- Fixed the bug introduced with the client idleTimeout feature (i.e. a long wait for the server to process a committed queue of actions leads to a client-initiated rollback)
- Updated weak dependency on `aldeed:collection2` package to version 2.10.0 (from 2.9.0)

### v0.7.15

- Added `forceCommitBeforeStart` option as a means of strictly keeping the app in a good state (at the cost of potentially messy data if there are bugs in the app)
- Made the client time out and auto-rollback if a transaction is open longer than a certain (configurable) number of milliseconds

### v0.7.14

- Added `check` package as a dependency

### v0.7.13

- Closes #57 where write operations were async when they should have been sync

### v0.7.12

- Fixes a bug with the ordering of actions when trying to repair a broken commit and removes `SimpleSchema.debug = true;`

### v0.7.11

- Fixes a bug with $addToSet and $pull where inverses were not being recorded correctly

### v0.7.10

- Restores a semblance of latency compensation in some cases

### v0.7.9

- Fixes a bug where an error is thrown unnecessarily on an empty transaction

### v0.7.8

- Closes issue #49 (insert callbacks with collection2 not working) and #50 (undo of $set modifiers with multiple fields not restoring previous state correctly)

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
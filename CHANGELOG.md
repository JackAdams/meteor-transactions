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

### v0.8.8

- Downgraded `socialize:server-time` dependency

### v0.8.7

- Updated `socialize:server-time` dependency and removed weak dependency on `aldeed:collection2`

### v0.8.6

- Merged PR that lets you set `tx.allowAutoTransaction = false` to disable default behaviour of auto-starting a transaction if there's no explicit tx.start() call

### v0.8.5

- Fix for an issue where transactions with `overridePermissionCheck = true` that were successful on the server, but unsuccessful when simulated on the client, left the client in a bad state

### v0.8.4

- Merged PR that retries repair of transactions that were being repaired during an app crash, when `retryFailedRepairs` is `true`

### v0.8.3

- Changed states of items on a transaction and the transaction state itself to `rolledBack` when the `repairMode` is set to `rollback` (it was previously `undone`, which was deceptive and not what we're after - i.e. removing the transaction from the mix completely)
- Added a second parameter (`retryFailedRepairs` - boolean) to the function `tx._repairAllIncomplete(mode, retryFailedRepairs)`, in case anyone wants to force another attempt to repair transactions that have have already failed to be repaired

### v0.8.2

- Accept an object literal as first param `tx.start` calls to provide an options hash; previously only accepted string for first param (description text) and object literal for second param (options hash). One of the fields of the options hash can be `description`

### v0.8.1

- Options to rethrow exceptions caught during a commit (#72)
- Fixes for removed documents not being saved properly (#73)
- Fix for hard removed documents that prevented them from being re-removed after a transaction (#74)
- Fixed a part of code that wasn't refactored properly for multiple transactions (#76)
- Upserts throw explicit exceptions (#78)
- You can now pass a value for `rethrowCommitError`, `forceCommitBeforeStart`, `useExistingTransaction` (all `false` by default) in the options hash when starting a transaction that will auto-commit

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
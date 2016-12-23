Two-phase commits -- release 0.7.0
--

__Things to consider__

- Preserve the current api, but change the default functionality so that everything gets passed to the server for the commit
- Retain all current functionality so that complete client-side transactions can be optionally performed and all changes pushed through allow/deny rules (but not by default)
- {instant: true} should be allowed (on both client and server) -- but will this still allow a true 2-phase commit?
- {instant: true} should be automatically detected and accounted for during the commit and rollback stages. To do this:
  - Tag each instant action with `state: pending` (or whatever the correct state would be) and the transaction_id
  - Roll these back server-side if a roll back is needed
  - Ignore these actions when doing the commit
- Consider the respective roles of the "rollback" and "undo" methods -- are they the same thing?  Should they be?  Can we better share code between the two?
- The execution stack can no longer be a queue (array) of functions. It will need to be a queue (array) of objects, each with the necessary data to make their changes (much like the data stored in `items` in the documents in the `transactions` collection)
- Transitional states of a single field in a document are not considered in the current implementation, unless {instant: true} is passed, mutating the doc on the fly. This means the inverse data value will always be the initial state of the field -- is that acceptable? It would require a pretty substantial rewrite to change this behaviour.

__Plans__

- Change the data storage format in the documents of the `transactions` collection -- or at the very least, add some further meta-data `actionNumber` (an integer that increments for each action) so that the actions can be executed in strict reverse order -- changing the format will simplify the code, or the code could be refactored to give the correct behaviour while preserving the current format. I'm leaning in favour of changing the data storage format, which would result in a lot of failing tests and no backwards compatibility, because the code is already complex enough and we need to be able to reason about it as easily as possible.

**UPDATE**

This is all pretty much implemented in the 0.7.x version of this package.
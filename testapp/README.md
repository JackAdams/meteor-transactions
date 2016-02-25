## Automated tests for babrahams:transactions package

This test application hosts a suite of automated tests for validating the babrahams:transactions package

It uses the [sanjo:jasmine](https://github.com/Sanjo/meteor-jasmine) Velocity-enabled test framework.

### Instructions

Checkout the full Meteor-Transactions repo into a clean folder

To start running tests locally:

```bash
$ cd testapp
$ JASMINE_CLIENT_UNIT=0 JASMINE_CLIENT_INTEGRATION=1 JASMINE_SERVER_UNIT=0 JASMINE_SERVER_INTEGRATION=1 meteor
```

Velocity will automatically re-run the test suite on every hot code push in the repo; either changes to the test code or changes to the meteor-transactions code itself.

To view the realtime test status, open a browser and navigate to http://localhost:3000 to view the test status by clicking the Velocity target button to open the test panel.

To run the tests for Continuous Integration, use the `meteor --test` command to execute the tests once:

```bash
$ JASMINE_CLIENT_UNIT=0 JASMINE_CLIENT_INTEGRATION=1 JASMINE_SERVER_UNIT=0 JASMINE_SERVER_INTEGRATION=1 meteor --test
```

To view the console output of the tests as they run, open another terminal:

```bash
tail -f testapp/.meteor/local/log/jasmine-server-integration.log
```

### Tests Structure

#### Server Integration Tests

Contained in `testapp/tests/jasmine/server/integration`, these tests run on the server, and verify the behaviour of package functionality when used exclusively on the server (e.g. in server-side Meteor methods).  These tests have access to the full Meteor context; nothing is stubbed by default although you can use jasmine Spies and Mocks if necessary.

#### Client Integration Tests

Contained in `testapp/tests/jasmine/client/integration`, these tests run on the client, and verify the behaviour of package functionality when used on the client (e.g. server-side Meteor methods can be called from the client and the tests will wait for results using Jasmine's `done()` feature).  These tests have access to the full Meteor context.

### For Test Authors

* All Jasmine server integration test source code must be wrapped in `Jasmine.onTest(function () { /* YOUR TESTS */ });`

* If you delete test files, you must manually delete the `testapp/packages/tests-proxy` folder to force Velocity to forget the deleted file
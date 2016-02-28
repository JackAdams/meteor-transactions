Package.describe({
  name: "babrahams:transactions",
  summary: "App level transactions for Meteor + Mongo",
  version: "0.7.11",
  git: "https://github.com/jackadams/meteor-transactions.git"
});

Package.onUse(function (api, where) {

  api.versionsFrom("1.0");

  // Meteor core
  api.use(['underscore','mongo','accounts-base','random','ejson']);
  api.imply('mongo');
  
  // Third party
  api.use('aldeed:collection2@2.9.0', ['client','server'], {weak:true});
  api.use('dburles:mongo-collection-instances@0.3.5');
  api.use('socialize:server-time@0.1.2');

  // Transactions2 package
  api.add_files('lib/transactions-common.js', ['client','server']);
  api.add_files('lib/transactions-server.js', 'server');
  
  if (api.export) {
    api.export('tx');
  }
  
});

Package.onTest(function(api) {

  api.use('sanjo:jasmine@0.21.0');
  api.use('babrahams:transactions');
  api.addFiles('tests/both/package-spec.js');
  api.addFiles('tests/server/unit-tests.js','server');
  
  // run these with the velocity html reporter
  // from the /testapp directory
  // using the following on the command line:
  // VELOCITY_TEST_PACKAGES=1 meteor test-packages --driver-package velocity:html-reporter babrahams:transactions -p 4050
  // then navigate to localhost:4050
  
});
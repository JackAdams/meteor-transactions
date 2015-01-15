Package.describe({
  name: "babrahams:transactions",
  summary: "Undo/Redo stack based on transactions",
  version: "0.6.6",
  git: "https://github.com/jackadams/meteor-transactions.git"
});

Package.onUse(function (api, where) {

  api.versionsFrom("1.0");

  api.use('jquery', 'client');
  api.use('tracker', 'client');
  api.use('minimongo', 'client');
  api.use('templating', 'client');
  api.use('spacebars', 'client');
  api.use('underscore');
  api.use('mongo');
  api.imply('mongo');
  api.use('dburles:mongo-collection-instances@0.2.6');

  api.add_files('lib/transactions_client.html', 'client');
  api.add_files('lib/transactions_client.js', 'client');
  api.add_files('lib/transactions_client.css', 'client');
  api.add_files('lib/transactions_server.js', 'server');
  api.add_files('lib/transactions_common.js', ['client','server']);
  
  if (api.export) {
    api.export('tx');
  }
  
});
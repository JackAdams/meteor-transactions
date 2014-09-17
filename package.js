Package.describe({
  summary: "Undo/Redo stack based on transactions",
  version: "0.2.0",
  git: "https://github.com/jackadams/meteor-transactions.git",
  name: "babrahams:transactions"
});

Package.on_use(function (api, where) {

  api.versionsFrom("0.9.2.1");

  api.use('startup', 'client');
  api.use('tracker', 'client');
  api.use('minimongo', 'client');
  api.use('templating', 'client');
  api.use('handlebars', 'client');
  api.use('underscore', ['client', 'server']);

  api.add_files('lib/transactions_client.html', 'client');
  api.add_files('lib/transactions_client.js', 'client');
  api.add_files('lib/transactions_client.css', 'client');
  api.add_files('lib/transactions_server.js', 'server');
  api.add_files('lib/transactions_common.js', ['client', 'server']);
  
  if (api.export) {
    api.export('tx');
  }
  
});
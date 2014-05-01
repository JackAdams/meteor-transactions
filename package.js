Package.describe({
  summary: "Undo/Redo writes to collections"
});

Package.on_use(function (api, where) {

  api.use('startup', 'client');
  api.use('deps', 'client');
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
Jasmine.onTest(function () {
  'use strict';

  describe('Meteor-transactions', function () {
    it('is available via Package["babrahams:transactions"].tx', function () {
      expect(Package['babrahams:transactions'].tx).toBeDefined();
    });
  });
});
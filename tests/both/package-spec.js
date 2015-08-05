'use strict';

describe('babrahams:transactions', function () {
  it('is available to the app via a variable called tx', function () {
    expect(Package["babrahams:transactions"].tx).toBeDefined();
    expect(tx).toBeDefined();
  })
});
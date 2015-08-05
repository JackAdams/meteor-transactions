'use strict';

/**
 * Tests the function that retrieves a nested value from an object,
 * given an object and a dot delimited key
 */

describe('passing an object and a dot delimited key to tx._drillDown', function () {
  it('should return the correct nested value', function () {
    var testObj = {
      a: {b : "Correct value"}    
    }
    var value = tx._drillDown(testObj, 'a.b');
    expect(value).toEqual('Correct value');
  });
  it('should return undefined if the key is not defined in the object', function () {
    var testObj = {};
    expect(tx._drillDown(testObj, 'a')).toBeUndefined();
  });
});
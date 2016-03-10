/**
 * Configure permission check for certain client integration tests
 */

tx.checkPermission = function (action, collection, doc, modifier) {
  if (doc && doc.denyMePermissionOnTheServer) {
	return false;  
  }
  return true;
}
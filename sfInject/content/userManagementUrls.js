/** URLs de UI: las URL de Login As se construyen exclusivamente en background. */
export const USER_ID_RE = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;
export function isUserManagementId(value) { return USER_ID_RE.test(String(value || '').trim()); }
export function salesforceSetupUserPath(userId) {
  return isUserManagementId(userId) ? `/lightning/setup/ManageUsers/page?address=%2F${encodeURIComponent(userId)}` : '';
}
export function salesforceUserRecordPath(userId) {
  return isUserManagementId(userId) ? `/${encodeURIComponent(userId)}` : '';
}
export function salesforcePermissionSetPath(id) {
  return isUserManagementId(id) ? `/lightning/setup/PermSets/page?address=%2F${encodeURIComponent(id)}` : '';
}
export function salesforcePermissionSetGroupPath(id) {
  return isUserManagementId(id) ? `/lightning/setup/PermSetGroups/page?address=%2F${encodeURIComponent(id)}` : '';
}
export const DEBUG_LOGS_SETUP_PATH = '/lightning/setup/ApexDebugLogs/home';

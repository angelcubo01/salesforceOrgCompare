/** Stable, non-sensitive error codes shared by the worker and user UI. */
export function setupUserErrorCode(error) {
  const raw = String(error?.salesforceErrorCode || error?.code || error?.message || error || 'API_ERROR');
  const known = ['ORG_READ_ONLY', 'WRITE_NOT_ALLOWED', 'FORBIDDEN', 'DISABLED', 'NO_SID', 'ORG_NOT_SAVED', 'INVALID_REQUEST', 'USER_NOT_FOUND', 'USER_INACTIVE', 'NOT_OWNER', 'INHERITED', 'GROUP_NOT_READY', 'DUPLICATE', 'LICENSE', 'DEPENDENCY', 'MANAGED_PACKAGE', 'INSUFFICIENT_ACCESS', 'MAX_WINDOW', 'TRACE_NOT_FOUND', 'NO_DEBUG_LEVEL', 'INCOGNITO_NOT_ENABLED', 'INCOGNITO_AUTH_REQUIRED', 'LOGIN_AS_NOT_AVAILABLE', 'EXTENSION_CONTEXT_INVALIDATED'];
  if (known.includes(raw)) return raw;
  if (/INVALID_SESSION|session expired|HTTP_401/i.test(raw) || error?.status === 401) return 'NO_SID';
  if (/LICENSE|FIELD_INTEGRITY_EXCEPTION.*license/i.test(raw)) return 'LICENSE';
  if (/DUPLICATE|already assigned/i.test(raw)) return 'DUPLICATE';
  if (/DEPENDENCY|DEPENDENT|DELETE_FAILED/i.test(raw)) return 'DEPENDENCY';
  if (/managed package|CANNOT_MODIFY_MANAGED/i.test(raw)) return 'MANAGED_PACKAGE';
  if (/INSUFFICIENT|INVALID_CROSS_REFERENCE|not have.*access/i.test(raw) || error?.status === 403) return 'INSUFFICIENT_ACCESS';
  if (/24 hours|MAX_WINDOW/i.test(raw)) return 'MAX_WINDOW';
  return 'API_ERROR';
}

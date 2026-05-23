/** Sufijos de dominio Salesforce aceptados para cookies y descubrimiento de org. */
export const ALLOWED_SF_SUFFIXES = [
  'salesforce.com',
  'lightning.force.com',
  'force.com',
  'salesforce-setup.com',
  'salesforce.mil',
  'force.mil',
  'sfcrmapps.cn',
  'sfcrmproducts.cn',
  'cloudforce.com',
  'cloudforce.mil',
  'visualforce.com',
  'visual.force.com'
];

/** @param {string} host */
export function hostnameMatchesSfCloud(host) {
  if (typeof host !== 'string' || !host) return false;
  const h = host.toLowerCase();
  return ALLOWED_SF_SUFFIXES.some((sfx) => h === sfx || h.endsWith(`.${sfx}`));
}

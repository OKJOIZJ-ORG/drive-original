// Authority comes from Google's verified token response, never browser input.
export const REQUESTED_GOOGLE_SCOPES = Object.freeze([
  'openid', 'https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.appdata',
]);
export function normalizeGrantedScopes(value) {
  if (!Array.isArray(value) || !value.length || value.length > 128
    || value.some(scope => typeof scope !== 'string' || !/^[\x21\x23-\x5b\x5d-\x7e]+$/u.test(scope))) {
    throw new TypeError('Invalid granted scopes');
  }
  const scopes = [...new Set(value)].sort();
  if (!scopes.includes('openid')) throw new TypeError('Missing OIDC scope');
  return scopes;
}
export function parseGrantedScopes(value) {
  if (typeof value !== 'string' || value.length > 16_384 || !value || value.trim() !== value || /[^\S ]/u.test(value)) {
    throw new TypeError('Invalid scope response');
  }
  return normalizeGrantedScopes(value.split(' '));
}
export function capabilitiesForScopes(value) {
  const scopes = new Set(normalizeGrantedScopes(value));
  const driveWrite = scopes.has('https://www.googleapis.com/auth/drive');
  return { version: 1, driveRead: driveWrite || scopes.has('https://www.googleapis.com/auth/drive.readonly'),
    driveWrite, appData: scopes.has('https://www.googleapis.com/auth/drive.appdata') || scopes.has('https://www.googleapis.com/auth/drive.appfolder') };
}
export function hasFullCapabilities(value) {
  return value?.version === 1 && value.driveRead === true && value.driveWrite === true && value.appData === true;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function base64urlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function base64urlDecode(value, { min = 0, max = 65_536 } = {}) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    throw new TypeError('Invalid base64url value');
  }
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  let binary;
  try { binary = atob(padded); } catch { throw new TypeError('Invalid base64url value'); }
  if (binary.length < min || binary.length > max) throw new TypeError('Invalid base64url size');
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (base64urlEncode(bytes) !== value) throw new TypeError('Non-canonical base64url value');
  return bytes;
}

async function importHmac(secret) {
  const raw = base64urlDecode(secret, { min: 32, max: 32 });
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function importAes(secret) {
  const raw = base64urlDecode(secret, { min: 32, max: 32 });
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function hmac(key, domain, value) {
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${domain}\0${value}`));
  return base64urlEncode(signature);
}

export async function sha256Base64url(value) {
  return base64urlEncode(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export function createAuthCrypto(env) {
  const required = ['AUTH_HMAC_KEY', 'ACCOUNT_KEY', 'CREDENTIAL_ENCRYPTION_KEY_V1'];
  if (required.some(name => typeof env?.[name] !== 'string' || !env[name])) throw new TypeError('Missing auth key binding');
  const authKey = importHmac(env.AUTH_HMAC_KEY);
  const accountKey = importHmac(env.ACCOUNT_KEY);
  const encryptionKey = importAes(env.CREDENTIAL_ENCRYPTION_KEY_V1);

  return Object.freeze({
    async ready() {
      await Promise.all([authKey, accountKey, encryptionKey]);
    },
    async digestCookie(value) {
      if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/u.test(value)) throw new TypeError('Invalid pre-auth cookie');
      return hmac(await authKey, 'drive-original/preauth-cookie/v1', value);
    },
    async sessionIndexKey(sessionId) {
      if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/u.test(sessionId)) throw new TypeError('Invalid session');
      return hmac(await authKey, 'drive-original/session-index/v1', sessionId);
    },
    async deriveAccountKey(issuer, subject) {
      if (typeof issuer !== 'string' || typeof subject !== 'string' || !subject) throw new TypeError('Invalid subject');
      return hmac(await accountKey, 'drive-original/account/v1', `${issuer}\0${subject}`);
    },
    async encryptRefresh(refreshToken, opaqueAccount) {
      if (typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 8192) throw new TypeError('Invalid refresh credential');
      if (!/^[A-Za-z0-9_-]{43}$/u.test(opaqueAccount)) throw new TypeError('Invalid account key');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const additionalData = encoder.encode(`drive-original/refresh/v1\0${opaqueAccount}`);
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
        await encryptionKey,
        encoder.encode(refreshToken),
      );
      return { v: 1, alg: 'A256GCM', iv: base64urlEncode(iv), ciphertext: base64urlEncode(ciphertext) };
    },
    async decryptRefresh(envelope, opaqueAccount) {
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
        Object.keys(envelope).sort().join(',') !== 'alg,ciphertext,iv,v' || envelope.v !== 1 || envelope.alg !== 'A256GCM' ||
        !/^[A-Za-z0-9_-]{43}$/u.test(opaqueAccount)) throw new TypeError('Invalid encrypted credential');
      const iv = base64urlDecode(envelope.iv, { min: 12, max: 12 });
      const ciphertext = base64urlDecode(envelope.ciphertext, { min: 17, max: 16_384 });
      const additionalData = encoder.encode(`drive-original/refresh/v1\0${opaqueAccount}`);
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
        await encryptionKey,
        ciphertext,
      );
      const result = decoder.decode(plaintext);
      if (!result || result.length > 8192) throw new TypeError('Invalid decrypted credential');
      return result;
    },
  });
}

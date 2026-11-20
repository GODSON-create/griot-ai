// ============================================================================
// GRIOT AI — CRYPTOGRAPHY, API KEY HASHING, SECRET VAULT & JWT ENGINE
// ============================================================================

import crypto from 'node:crypto';
import type { OrgRole, PermissionScope } from '../types/domain.ts';

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export function generateApiKey(): {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
} {
  const prefixToken = crypto.randomBytes(4).toString('hex');
  const secretToken = crypto.randomBytes(24).toString('base64url');
  const rawKey = `griot_sk_${prefixToken}_${secretToken}`;
  const keyPrefix = `griot_sk_${prefixToken}`;
  const keyHash = hashApiKey(rawKey);
  return { rawKey, keyPrefix, keyHash };
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

export function deriveAesKey(masterKey: string): Buffer {
  return crypto.createHash('sha256').update(masterKey, 'utf8').digest();
}

export function encryptSecretVault(
  plaintextSecret: string,
  masterKey: string
): {
  encryptedSecret: string;
  iv: string;
  authTag: string;
  keyHint: string;
} {
  const key = deriveAesKey(masterKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintextSecret, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const keyHint =
    plaintextSecret.length >= 8
      ? `${plaintextSecret.slice(0, 3)}***${plaintextSecret.slice(-2)}`
      : '***';
  return {
    encryptedSecret: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyHint,
  };
}

export function decryptSecretVault(
  payload: { encryptedSecret: string; iv: string; authTag: string },
  masterKey: string
): string {
  const key = deriveAesKey(masterKey);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedSecret, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export interface JwtClaims {
  sub: string;
  orgId: string;
  workspaceId?: string | null;
  role: OrgRole;
  scopes: PermissionScope[];
  iat: number;
  exp: number;
}

export function signJwtToken(
  claims: Omit<JwtClaims, 'iat' | 'exp'>,
  jwtSecret: string,
  expiresInSeconds = 3600 * 12
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullClaims: JwtClaims = {
    ...claims,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const headerB64 = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    'utf8'
  ).toString('base64url');
  const payloadB64 = Buffer.from(
    JSON.stringify(fullClaims),
    'utf8'
  ).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;
  const sigB64 = crypto
    .createHmac('sha256', jwtSecret)
    .update(signingInput, 'utf8')
    .digest('base64url');
  return `${signingInput}.${sigB64}`;
}

export function verifyJwtToken(token: string, jwtSecret: string): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT token');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = crypto
    .createHmac('sha256', jwtSecret)
    .update(signingInput, 'utf8')
    .digest();
  const actualSig = Buffer.from(sigB64, 'base64url');
  if (
    expectedSig.length !== actualSig.length ||
    !crypto.timingSafeEqual(expectedSig, actualSig)
  ) {
    throw new Error('Invalid JWT signature');
  }
  const claims = JSON.parse(
    Buffer.from(payloadB64, 'base64url').toString('utf8')
  ) as JwtClaims;
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp < now) {
    throw new Error('JWT token has expired');
  }
  return claims;
}

export function signInternalFileToken(
  params: { fileId: string; orgId: string; userId: string; expiresAtUnix: number },
  fileSigningSecret: string
): string {
  const payload = JSON.stringify(params);
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', fileSigningSecret)
    .update(payloadB64, 'utf8')
    .digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

export function verifyInternalFileToken(
  token: string,
  fileSigningSecret: string
): { fileId: string; orgId: string; userId: string; expiresAtUnix: number } {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Malformed file access token');
  }
  const [payloadB64, sigB64] = parts;
  const expectedSig = crypto
    .createHmac('sha256', fileSigningSecret)
    .update(payloadB64, 'utf8')
    .digest();
  const actualSig = Buffer.from(sigB64, 'base64url');
  if (
    expectedSig.length !== actualSig.length ||
    !crypto.timingSafeEqual(expectedSig, actualSig)
  ) {
    throw new Error('Invalid file access signature');
  }
  const parsed = JSON.parse(
    Buffer.from(payloadB64, 'base64url').toString('utf8')
  ) as { fileId: string; orgId: string; userId: string; expiresAtUnix: number };
  if (parsed.expiresAtUnix < Math.floor(Date.now() / 1000)) {
    throw new Error('File access token expired');
  }
  return parsed;
}

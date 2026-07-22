import * as crypto from 'crypto';

/**
 * Project-wide helpers for opaque token + verification code generation.
 *
 * Refresh tokens, password reset tokens, and email verification link tokens
 * are all stored as sha256(rawToken). The raw token is sent to the client
 * (or embedded in an email link) and never persisted, so a leaked database
 * snapshot cannot be used to forge tokens.
 *
 * Verification codes (6 digits) are stored plain — they're short by design
 * and protected via short TTL + attempt counter + global throttling.
 */

const LINK_TOKEN_BYTES = 32;

export function generateLinkToken(): string {
  return crypto.randomBytes(LINK_TOKEN_BYTES).toString('hex');
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateVerificationCode(length: number): string {
  if (length < 4 || length > 10) {
    throw new Error('Verification code length must be between 4 and 10');
  }
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return crypto.randomInt(min, max).toString();
}

/**
 * A pre-computed bcrypt hash used as a target when no account matches
 * during login. Comparing against it preserves response timing parity so
 * "user does not exist" and "wrong password" take similar time.
 *
 * The hash itself never authenticates anything — its plaintext is unknown
 * and unrelated to any real password.
 */
export const DUMMY_BCRYPT_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8/qY3F3PiP3PXqMqXJZ4xCEcuPxJua';

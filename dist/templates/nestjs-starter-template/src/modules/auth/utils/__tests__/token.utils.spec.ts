import {
  generateLinkToken,
  hashToken,
  generateVerificationCode,
  DUMMY_BCRYPT_HASH,
} from '../token.utils';
import * as crypto from 'crypto';

describe('token.utils', () => {
  describe('generateLinkToken', () => {
    it('returns a 64-character hex string (32 bytes)', () => {
      const token = generateLinkToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(token).toHaveLength(64);
    });

    it('returns unique tokens across calls', () => {
      const tokens = new Set(Array.from({ length: 50 }, () => generateLinkToken()));
      expect(tokens.size).toBe(50);
    });
  });

  describe('hashToken', () => {
    it('returns a sha256 hex digest (64 chars)', () => {
      const hash = hashToken('some-raw-token');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('matches the canonical sha256 of the input', () => {
      const input = 'raw-token-value';
      const expected = crypto.createHash('sha256').update(input).digest('hex');
      expect(hashToken(input)).toBe(expected);
    });

    it('is stable for the same input', () => {
      expect(hashToken('abc')).toBe(hashToken('abc'));
    });

    it('differs for different inputs', () => {
      expect(hashToken('abc')).not.toBe(hashToken('abd'));
    });
  });

  describe('generateVerificationCode', () => {
    it('returns a numeric code of the requested length', () => {
      for (const length of [4, 6, 8, 10]) {
        const code = generateVerificationCode(length);
        expect(code).toHaveLength(length);
        expect(code).toMatch(/^[0-9]+$/);
      }
    });

    it('never produces a leading-zero (always full length)', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateVerificationCode(6);
        expect(code).toHaveLength(6);
        expect(code[0]).not.toBe('0');
      }
    });

    it('throws for length < 4', () => {
      expect(() => generateVerificationCode(3)).toThrow(
        'Verification code length must be between 4 and 10',
      );
    });

    it('throws for length > 10', () => {
      expect(() => generateVerificationCode(11)).toThrow(
        'Verification code length must be between 4 and 10',
      );
    });
  });

  describe('DUMMY_BCRYPT_HASH', () => {
    it('is a bcrypt-format string', () => {
      expect(DUMMY_BCRYPT_HASH).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
    });
  });
});

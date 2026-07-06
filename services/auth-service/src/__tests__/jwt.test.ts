import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
} from '../config/jwt';

const TEST_SECRET = 'test-jwt-secret-for-unit-tests';
const OLD_JWT_SECRET = process.env.JWT_SECRET;

describe('JWT utilities', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    if (OLD_JWT_SECRET) process.env.JWT_SECRET = OLD_JWT_SECRET;
    else delete process.env.JWT_SECRET;
  });

  describe('signAccessToken', () => {
    it('creates a signed JWT with sub and role', () => {
      const token = signAccessToken('user-123', 'customer');
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWS format
    });

    it('sets correct role for admin', () => {
      const token = signAccessToken('admin-456', 'admin');
      const decoded = decodeToken(token);
      expect(decoded?.role).toBe('admin');
    });

    it('sets correct role for customer', () => {
      const token = signAccessToken('user-789', 'customer');
      const decoded = decodeToken(token);
      expect(decoded?.role).toBe('customer');
    });
  });

  describe('signRefreshToken', () => {
    it('creates a signed token with type=refresh', () => {
      const token = signRefreshToken('user-123');
      const decoded = decodeToken(token) as { sub: string; type: string } | null;
      expect(decoded?.sub).toBe('user-123');
      expect(decoded?.type).toBe('refresh');
    });
  });

  describe('verifyAccessToken', () => {
    it('verifies a valid access token and returns payload', () => {
      const token = signAccessToken('user-abc', 'customer');
      const payload = verifyAccessToken(token);
      expect(payload.sub).toBe('user-abc');
      expect(payload.role).toBe('customer');
    });

    it('throws UnauthorizedError for an invalid token', () => {
      expect(() => verifyAccessToken('not.a.valid.token')).toThrow('Invalid or expired access token');
    });

    it('throws UnauthorizedError for a token signed with a different secret', () => {
      // Temporarily swap secret to issue a token with a different key
      const otherSecret = 'different-secret';
      process.env.JWT_SECRET = otherSecret;
      const badToken = signAccessToken('user-xyz', 'customer');
      process.env.JWT_SECRET = TEST_SECRET;

      expect(() => verifyAccessToken(badToken)).toThrow('Invalid or expired access token');
    });
  });

  describe('verifyRefreshToken', () => {
    it('verifies a valid refresh token', () => {
      const token = signRefreshToken('refresh-user-123');
      const payload = verifyRefreshToken(token);
      expect(payload.sub).toBe('refresh-user-123');
    });

    it('throws for an access token passed as refresh', () => {
      const accessToken = signAccessToken('user-123', 'customer');
      // jwt.verify succeeds (valid signature, not expired), we detect type mismatch
      expect(() => verifyRefreshToken(accessToken)).toThrow();
    });

    it('throws for a token signed with wrong secret', () => {
      const otherSecret = 'wrong-secret';
      process.env.JWT_SECRET = otherSecret;
      const badToken = signRefreshToken('user-789');
      process.env.JWT_SECRET = TEST_SECRET;

      expect(() => verifyRefreshToken(badToken)).toThrow('Invalid or expired refresh token');
    });
  });

  describe('decodeToken', () => {
    it('decodes a token without verification', () => {
      const token = signAccessToken('decode-me', 'admin');
      const decoded = decodeToken(token);
      expect(decoded?.sub).toBe('decode-me');
      expect(decoded?.role).toBe('admin');
    });

    it('returns null for an invalid base64 string', () => {
      expect(decodeToken('not-even-close')).toBeNull();
    });
  });
});
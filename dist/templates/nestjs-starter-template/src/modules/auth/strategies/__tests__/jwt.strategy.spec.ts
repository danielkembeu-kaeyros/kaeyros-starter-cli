import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../jwt.strategy';
import { AuthService } from '../../auth.service';
import { JwtPayload, RequestUser } from '../../../../common/authz/types';

describe('JwtStrategy', () => {
  const mockAuthService = {
    resolveAuthenticatedUser: jest.fn(),
  } as unknown as AuthService;

  const configWith = (secret?: string): ConfigService =>
    ({
      get: jest.fn().mockReturnValue(secret),
    }) as unknown as ConfigService;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('constructs when jwt.secret is configured', () => {
    const strategy = new JwtStrategy(configWith('a-secret'), mockAuthService);
    expect(strategy).toBeDefined();
  });

  it('throws when jwt.secret is missing', () => {
    expect(() => new JwtStrategy(configWith(undefined), mockAuthService)).toThrow(
      'jwt.secret is not configured',
    );
  });

  describe('validate', () => {
    it('delegates to authService.resolveAuthenticatedUser and returns its result', async () => {
      const payload = { sub: 'user-1' } as unknown as JwtPayload;
      const resolved = { id: 'user-1' } as unknown as RequestUser;
      (mockAuthService.resolveAuthenticatedUser as jest.Mock).mockResolvedValue(resolved);

      const strategy = new JwtStrategy(configWith('a-secret'), mockAuthService);
      const result = await strategy.validate(payload);

      expect(mockAuthService.resolveAuthenticatedUser).toHaveBeenCalledWith(payload);
      expect(result).toBe(resolved);
    });
  });
});

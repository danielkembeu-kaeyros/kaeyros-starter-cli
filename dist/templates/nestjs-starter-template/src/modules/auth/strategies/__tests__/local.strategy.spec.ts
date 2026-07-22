import 'reflect-metadata';
import { LocalStrategy } from '../local.strategy';
import { AuthService } from '../../auth.service';
import { UnauthorizedException } from '../../../../common/exceptions/custom-exceptions';
import { RequestUser } from '../../../../common/authz/types';

describe('LocalStrategy', () => {
  const mockAuthService = {
    validateForLogin: jest.fn(),
  } as unknown as AuthService;

  let strategy: LocalStrategy;

  beforeEach(() => {
    strategy = new LocalStrategy(mockAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is defined', () => {
    expect(strategy).toBeDefined();
  });

  it('returns the user when validateForLogin succeeds', async () => {
    const user = { id: 'u1', email: 'a@b.c' } as unknown as RequestUser;
    (mockAuthService.validateForLogin as jest.Mock).mockResolvedValue(user);

    const result = await strategy.validate('a@b.c', 'secret');

    expect(mockAuthService.validateForLogin).toHaveBeenCalledWith('a@b.c', 'secret');
    expect(result).toBe(user);
  });

  it('throws UnauthorizedException when validateForLogin returns null', async () => {
    (mockAuthService.validateForLogin as jest.Mock).mockResolvedValue(null);

    await expect(strategy.validate('a@b.c', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

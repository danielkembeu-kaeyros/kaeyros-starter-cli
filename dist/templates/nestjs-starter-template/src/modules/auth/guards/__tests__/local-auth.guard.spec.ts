import 'reflect-metadata';
import { LocalAuthGuard } from '../local-auth.guard';

describe('LocalAuthGuard', () => {
  it('is instantiable', () => {
    const guard = new LocalAuthGuard();
    expect(guard).toBeDefined();
    expect(guard).toBeInstanceOf(LocalAuthGuard);
  });

  it('exposes a canActivate method (from AuthGuard)', () => {
    const guard = new LocalAuthGuard();
    expect(typeof guard.canActivate).toBe('function');
  });
});

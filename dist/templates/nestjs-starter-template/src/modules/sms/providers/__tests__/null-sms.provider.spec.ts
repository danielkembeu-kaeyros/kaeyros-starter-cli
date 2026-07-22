import 'reflect-metadata';
import { NullSmsProvider } from '../null-sms.provider';

describe('NullSmsProvider', () => {
  let provider: NullSmsProvider;

  beforeEach(() => {
    provider = new NullSmsProvider();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('send', () => {
    it('resolves with a synthetic messageId without making a network call', async () => {
      const result = await provider.send({ to: '+14155550100', body: 'hello' });

      expect(result.messageId).toEqual(expect.stringMatching(/^null-/));
    });

    it('returns a unique messageId per call', async () => {
      const a = await provider.send({ to: '+1', body: 'a' });
      const b = await provider.send({ to: '+1', body: 'b' });

      expect(a.messageId).not.toBe(b.messageId);
    });
  });

  describe('isConfigured', () => {
    it('returns false', () => {
      expect(provider.isConfigured()).toBe(false);
    });
  });
});

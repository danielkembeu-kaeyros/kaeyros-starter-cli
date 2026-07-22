import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import { TwilioSmsProvider } from '../twilio-sms.provider';

jest.mock('twilio');

describe('TwilioSmsProvider', () => {
  const mockMessagesCreate = jest.fn();
  const mockTwilioClient = { messages: { create: mockMessagesCreate } };
  const twilioFactory = twilio as unknown as jest.Mock;

  const makeConfig = (values: Record<string, string | undefined>): ConfigService =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  const FULL = {
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'token-456',
    TWILIO_FROM_NUMBER: '+14155550000',
  };

  beforeEach(() => {
    twilioFactory.mockReturnValue(mockTwilioClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isConfigured', () => {
    it('returns true when SID, token and from-number are all present', () => {
      const provider = new TwilioSmsProvider(makeConfig(FULL));

      expect(provider.isConfigured()).toBe(true);
      expect(twilioFactory).toHaveBeenCalledWith('AC123', 'token-456');
    });

    it('returns false when SID is missing', () => {
      const provider = new TwilioSmsProvider(
        makeConfig({ ...FULL, TWILIO_ACCOUNT_SID: undefined }),
      );

      expect(provider.isConfigured()).toBe(false);
      expect(twilioFactory).not.toHaveBeenCalled();
    });

    it('returns false when auth token is missing', () => {
      const provider = new TwilioSmsProvider(makeConfig({ ...FULL, TWILIO_AUTH_TOKEN: undefined }));

      expect(provider.isConfigured()).toBe(false);
    });

    it('returns false when from-number is missing', () => {
      const provider = new TwilioSmsProvider(
        makeConfig({ ...FULL, TWILIO_FROM_NUMBER: undefined }),
      );

      expect(provider.isConfigured()).toBe(false);
    });
  });

  describe('send', () => {
    it('calls messages.create with to/body/from and returns the sid', async () => {
      mockMessagesCreate.mockResolvedValue({ sid: 'SM999' });
      const provider = new TwilioSmsProvider(makeConfig(FULL));

      const result = await provider.send({ to: '+14155550100', body: 'hi there' });

      expect(mockMessagesCreate).toHaveBeenCalledWith({
        to: '+14155550100',
        from: '+14155550000',
        body: 'hi there',
      });
      expect(result).toEqual({ messageId: 'SM999' });
    });

    it('throws when the provider is not configured', async () => {
      const provider = new TwilioSmsProvider(makeConfig({ ...FULL, TWILIO_AUTH_TOKEN: undefined }));

      await expect(provider.send({ to: '+1', body: 'x' })).rejects.toThrow(
        'Twilio SMS provider is not configured',
      );
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });
  });
});

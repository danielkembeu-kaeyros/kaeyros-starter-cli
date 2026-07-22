import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SMS_PROVIDER, SmsProvider } from './sms.types';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';
import { NullSmsProvider } from './providers/null-sms.provider';

/**
 * Wires the active SmsProvider behind the SMS_PROVIDER token.
 *
 * Selection logic:
 *  - SMS_PROVIDER=twilio (default) and Twilio creds are set    → Twilio
 *  - SMS_PROVIDER=twilio but creds missing                     → no-op (logs only)
 *  - SMS_PROVIDER=null                                         → no-op
 *
 * Global so any feature module can inject SMS_PROVIDER without re-import.
 */
@Global()
@Module({
  providers: [
    TwilioSmsProvider,
    NullSmsProvider,
    {
      provide: SMS_PROVIDER,
      useFactory: (
        configService: ConfigService,
        twilio: TwilioSmsProvider,
        nullProvider: NullSmsProvider,
      ): SmsProvider => {
        const name = configService.get<string>('SMS_PROVIDER', 'twilio');
        switch (name) {
          case 'twilio':
            return twilio.isConfigured() ? twilio : nullProvider;
          case 'null':
            return nullProvider;
          default:
            throw new Error(`Unsupported SMS_PROVIDER: ${name}`);
        }
      },
      inject: [ConfigService, TwilioSmsProvider, NullSmsProvider],
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}

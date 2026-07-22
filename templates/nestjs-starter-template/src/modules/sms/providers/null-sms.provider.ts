import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { SmsProvider, SmsSendInput, SmsSendResult } from '../sms.types';

/**
 * Dev / test SMS provider. Logs the outbound message at info level and
 * returns a synthetic id. Never makes a network call. Wired automatically
 * when no concrete provider env is configured, so local development
 * doesn't require Twilio creds.
 */
@Injectable()
export class NullSmsProvider implements SmsProvider {
  private readonly logger = new Logger(NullSmsProvider.name);

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    this.logger.log(`[no-op SMS] to=${input.to} body=${input.body}`);
    return { messageId: `null-${crypto.randomUUID()}` };
  }

  isConfigured(): boolean {
    return false;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import { SmsProvider, SmsSendInput, SmsSendResult } from '../sms.types';

@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  private readonly logger = new Logger(TwilioSmsProvider.name);
  private readonly client: ReturnType<typeof twilio> | null;
  private readonly fromNumber: string;

  constructor(private readonly configService: ConfigService) {
    const sid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.configService.get<string>('TWILIO_FROM_NUMBER') ?? '';

    if (sid && token && this.fromNumber) {
      this.client = twilio(sid, token);
    } else {
      this.client = null;
      this.logger.warn(
        'Twilio is not fully configured. SMS sends will fail until TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are set.',
      );
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    if (!this.client) {
      throw new Error('Twilio SMS provider is not configured');
    }
    const message = await this.client.messages.create({
      to: input.to,
      from: this.fromNumber,
      body: input.body,
    });
    return { messageId: message.sid };
  }
}

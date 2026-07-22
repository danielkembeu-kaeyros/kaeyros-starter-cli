import { SendEmailResult } from '../../src/modules/email/interfaces/email.interface';
import { SmsProvider, SmsSendInput, SmsSendResult } from '../../src/modules/sms/sms.types';
import {
  StorageProvider,
  StoragePutInput,
  StoragePutResult,
} from '../../src/modules/storage/storage.types';

/**
 * Recording EmailService stand-in. e2e flows (verify email, reset password,
 * OTP login, admin invite) need the codes/tokens that production would only
 * deliver by email — this captures them so specs can complete the flow.
 *
 * Shape-compatible with the real EmailService for the methods callers use.
 */
export class FakeEmailService {
  readonly sent: Array<{ type: string; to: string; payload: Record<string, unknown> }> = [];

  private ok(): SendEmailResult {
    return { success: true, messageId: `fake-${this.sent.length}` };
  }

  async sendEmailVerification(
    to: string,
    verificationCode: string,
    _userName?: string,
    verificationLink?: string,
  ): Promise<SendEmailResult> {
    this.sent.push({ type: 'verification', to, payload: { verificationCode, verificationLink } });
    return this.ok();
  }

  async sendPasswordResetEmail(to: string, resetToken: string): Promise<SendEmailResult> {
    this.sent.push({ type: 'password-reset', to, payload: { resetToken } });
    return this.ok();
  }

  async sendLoginOtpEmail(
    to: string,
    code: string,
    expiryMinutes: number,
  ): Promise<SendEmailResult> {
    this.sent.push({ type: 'login-otp', to, payload: { code, expiryMinutes } });
    return this.ok();
  }

  async sendOtpAdminInviteEmail(
    to: string,
    options: Record<string, unknown>,
  ): Promise<SendEmailResult> {
    this.sent.push({ type: 'admin-invite-otp', to, payload: options });
    return this.ok();
  }

  async sendWelcomeEmail(to: string): Promise<SendEmailResult> {
    this.sent.push({ type: 'welcome', to, payload: {} });
    return this.ok();
  }

  async sendEmail(options: {
    to: string;
    context?: Record<string, unknown>;
  }): Promise<SendEmailResult> {
    this.sent.push({ type: 'generic', to: options.to, payload: options.context ?? {} });
    return this.ok();
  }

  async verifyConnection(): Promise<boolean> {
    return true;
  }

  // --- test helpers ---------------------------------------------------------

  reset(): void {
    this.sent.length = 0;
  }

  last(type: string, to?: string): Record<string, unknown> | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i];
      if (m.type === type && (!to || m.to === to)) return m.payload;
    }
    return undefined;
  }

  verificationCode(to: string): string | undefined {
    return this.last('verification', to)?.verificationCode as string | undefined;
  }

  verificationLink(to: string): string | undefined {
    return this.last('verification', to)?.verificationLink as string | undefined;
  }

  resetToken(to: string): string | undefined {
    return this.last('password-reset', to)?.resetToken as string | undefined;
  }

  otpCode(to: string): string | undefined {
    return this.last('login-otp', to)?.code as string | undefined;
  }

  tempPassword(to: string): string | undefined {
    return this.last('generic', to)?.temporaryPassword as string | undefined;
  }
}

/** In-memory StorageProvider — no S3. Records puts; returns deterministic URLs. */
export class FakeStorageProvider implements StorageProvider {
  readonly objects = new Map<string, Buffer>();

  async put(input: StoragePutInput): Promise<StoragePutResult> {
    this.objects.set(input.key, input.body);
    return { key: input.key, size: input.body.length };
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async getDownloadUrl(key: string): Promise<string> {
    return `https://fake-storage.test/${encodeURIComponent(key)}?signed=1`;
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
}

/** Recording SmsProvider — never hits Twilio. */
export class FakeSmsProvider implements SmsProvider {
  readonly sent: SmsSendInput[] = [];

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    this.sent.push(input);
    return { messageId: `fake-sms-${this.sent.length}` };
  }

  isConfigured(): boolean {
    return true;
  }

  reset(): void {
    this.sent.length = 0;
  }
}

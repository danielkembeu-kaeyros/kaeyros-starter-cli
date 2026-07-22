/**
 * SMS abstraction
 * ---------------
 * Mirrors StorageProvider — application code injects via SMS_PROVIDER and
 * never imports a vendor SDK directly. Providers (Twilio, AWS SNS, Vonage,
 * a no-op for dev) implement this surface.
 */

export interface SmsSendInput {
  /** E.164 destination (e.g. +14155550100). */
  to: string;
  /** Message body. SMS providers usually cap at 1600 chars; OTPs are tiny. */
  body: string;
}

export interface SmsSendResult {
  /** Provider-specific message id, returned for audit / debugging. */
  messageId: string;
}

export interface SmsProvider {
  send(input: SmsSendInput): Promise<SmsSendResult>;
  /** Soft availability check — true when the provider is wired and ready. */
  isConfigured(): boolean;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

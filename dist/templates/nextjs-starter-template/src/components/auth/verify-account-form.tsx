'use client';

import { Button } from '@/components/ui/button';
import { VerificationCodeInput } from '@/components/auth/verification-code-input';
import { useVerification, useResendCode, useCountdown } from '@/hooks/use-verification';
import { useAuthStore } from '@/stores/auth.store';
import { useAuth } from '@/hooks/use-auth';
import type { StandardizedError } from '@/types';

export function VerifyAccountForm() {
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const { mutate: verify, isPending, error } = useVerification();
  const { mutate: resendCode, isPending: isResending } = useResendCode();
  const { seconds, isActive, start } = useCountdown(60);

  const handleComplete = (code: string) => {
    verify(code);
  };

  const handleResend = () => {
    resendCode();
    start();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <p className="text-sm text-muted-foreground">
          We sent a verification code to <span className="font-semibold">{user?.email}</span>
        </p>
        <p className="text-xs text-muted-foreground">Enter the 6-digit code below</p>
      </div>

      <VerificationCodeInput onComplete={handleComplete} disabled={isPending} />

      {error && (
        <div className="rounded-md bg-destructive/10 p-3">
          <p className="text-sm text-center text-destructive">
            {(error as unknown as StandardizedError).message ||
              'Invalid or expired code. Please try again.'}
          </p>
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleResend}
          disabled={isActive || isResending}
        >
          {isActive ? `Resend code in ${seconds}s` : isResending ? 'Sending...' : 'Resend code'}
        </Button>

        <Button type="button" variant="link" size="sm" onClick={() => logout()}>
          Log out
        </Button>
      </div>
    </div>
  );
}

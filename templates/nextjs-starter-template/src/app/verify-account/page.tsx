'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VerifyAccountForm } from '@/components/auth/verify-account-form';
import { useAuthStore } from '@/stores/auth.store';
import { tokenManager } from '@/services/api.service';

export default function VerifyAccountPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const hasTokens = tokenManager.getTokens();

  useEffect(() => {
    if (!hasTokens || !isAuthenticated) {
      router.push('/login');
    } else if (user?.emailVerified) {
      router.push('/dashboard');
    }
  }, [hasTokens, isAuthenticated, user, router]);

  if (!user || user.emailVerified) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Verify Your Email</CardTitle>
          <CardDescription className="text-center">
            Please enter the verification code to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VerifyAccountForm />
        </CardContent>
      </Card>
    </div>
  );
}

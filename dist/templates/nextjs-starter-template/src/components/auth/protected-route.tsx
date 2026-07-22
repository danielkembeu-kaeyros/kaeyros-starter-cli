'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { tokenManager } from '@/services/api.service';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const hasTokens = tokenManager.getTokens();

  useEffect(() => {
    if (!hasTokens) {
      router.push('/login');
    } else if (isAuthenticated && user && !user.emailVerified) {
      router.push('/verify-account');
    }
  }, [hasTokens, isAuthenticated, user, router]);

  // Show spinner while checking authentication
  if (hasTokens && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // No tokens or unverified, will redirect via useEffect
  if (!hasTokens || !user?.emailVerified) {
    return null;
  }

  return <>{children}</>;
}

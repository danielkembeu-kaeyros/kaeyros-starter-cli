import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/auth.service';
import { tokenManager } from '@/services/api.service';
import { useAuthStore } from '@/stores/auth.store';
import type { LoginCredentials, SignupData } from '@/types';

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, setUser, logout: logoutStore } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) => authService.login(credentials),
    onSuccess: data => {
      setUser(data.user);
      queryClient.invalidateQueries({ queryKey: ['user'] });

      // Check if email verification is required
      if (!data.user.emailVerified) {
        router.push('/verify-account');
      } else {
        router.push('/dashboard');
      }
    },
  });

  const registerMutation = useMutation({
    mutationFn: (data: SignupData) => authService.register(data),
    onSuccess: data => {
      setUser(data.user);
      queryClient.invalidateQueries({ queryKey: ['user'] });

      // Check if email verification is required
      if (!data.user.emailVerified) {
        router.push('/verify-account');
      } else {
        router.push('/dashboard');
      }
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      logoutStore();
      tokenManager.clearTokens();
      queryClient.clear();
      router.push('/login');
    },
  });

  const { data: currentUser, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => authService.getCurrentUser(),
    enabled: !!tokenManager.getTokens()?.accessToken && !user,
    retry: false,
  });

  // Sync user from query to store
  if (currentUser && !user) {
    setUser(currentUser);
  }

  return {
    user,
    isAuthenticated,
    isLoading: isLoading || loginMutation.isPending || registerMutation.isPending,
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout: logoutMutation.mutate,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
  };
}

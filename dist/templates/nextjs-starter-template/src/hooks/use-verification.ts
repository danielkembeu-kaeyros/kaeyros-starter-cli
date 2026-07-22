import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';

export function useVerification() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setUser } = useAuthStore();

  return useMutation({
    mutationFn: (code: string) => authService.verifyEmail(code),
    onSuccess: data => {
      setUser(data.user);
      queryClient.invalidateQueries({ queryKey: ['user'] });
      toast.success('Email verified successfully!');
      router.push('/dashboard');
    },
  });
}

export function useResendCode() {
  return useMutation({
    mutationFn: () => authService.sendVerificationCode(),
    onSuccess: data => {
      toast.success(data.message);
    },
  });
}

export function useCountdown(initialSeconds: number) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds(s => s - 1);
      }, 1000);
    } else if (seconds === 0) {
      setIsActive(false);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, seconds]);

  const start = () => {
    setSeconds(initialSeconds);
    setIsActive(true);
  };

  const reset = () => {
    setSeconds(initialSeconds);
    setIsActive(false);
  };

  return { seconds, isActive, start, reset };
}

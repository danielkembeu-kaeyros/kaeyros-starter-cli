import { toast } from 'sonner';
import { useCallback } from 'react';
import type { StandardizedError } from '@/types';

export function useErrorHandler() {
  const handleError = useCallback((error: unknown, showToast = true) => {
    const standardized = error as StandardizedError;

    if (showToast && standardized.message) {
      toast.error(standardized.message);
    }

    return standardized;
  }, []);

  const getFieldErrors = useCallback((error: unknown) => {
    const standardized = error as StandardizedError;
    return standardized.fieldErrors;
  }, []);

  return { handleError, getFieldErrors };
}

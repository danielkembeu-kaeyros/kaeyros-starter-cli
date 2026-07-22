import { AxiosError } from 'axios';
import type { StandardizedError } from '@/types';

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check your input.',
  401: 'You are not authenticated. Please log in.',
  403: "You don't have permission to perform this action.",
  404: 'The requested resource was not found.',
  409: 'A conflict occurred. This resource may already exist.',
  422: 'Validation failed. Please check your input.',
  429: 'Too many requests. Please try again later.',
  500: 'An unexpected server error occurred. Please try again.',
  503: 'Service temporarily unavailable. Please try again later.',
};

export function mapAxiosError(error: unknown): StandardizedError {
  if (!(error instanceof Error)) {
    return {
      message: 'An unexpected error occurred',
      statusCode: 0,
      originalError: error,
    };
  }

  if (!isAxiosError(error)) {
    return {
      message: error.message || 'An unexpected error occurred',
      statusCode: 0,
      originalError: error,
    };
  }

  // Network error (no response)
  if (!error.response) {
    return {
      message: 'Network error. Please check your connection.',
      statusCode: 0,
      originalError: error,
    };
  }

  const { status, data } = error.response;

  // Server returned structured error
  if (data && typeof data === 'object') {
    const errorData = data as {
      message?: string;
      errors?: Record<string, string[]>;
      code?: string;
    };
    return {
      message: errorData.message || STATUS_MESSAGES[status] || 'An error occurred',
      statusCode: status,
      fieldErrors: errorData.errors,
      code: errorData.code,
      originalError: error,
    };
  }

  // Fallback to status code message
  return {
    message: STATUS_MESSAGES[status] || 'An error occurred',
    statusCode: status,
    originalError: error,
  };
}

function isAxiosError(error: unknown): error is AxiosError {
  return (error as AxiosError).isAxiosError === true;
}

export function getErrorMessage(error: unknown): string {
  const standardized = mapAxiosError(error);
  return standardized.message;
}

export function getFieldErrors(error: unknown): Record<string, string[]> | undefined {
  const standardized = mapAxiosError(error);
  return standardized.fieldErrors;
}

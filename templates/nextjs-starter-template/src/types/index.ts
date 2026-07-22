export interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
  emailVerified: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData extends LoginCredentials {
  firstName: string;
  lastName: string;
  phone: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export interface ApiError {
  message: string;
  statusCode?: number;
  errors?: Record<string, string[]>;
}

export interface StandardizedError {
  message: string;
  statusCode: number;
  fieldErrors?: Record<string, string[]>;
  code?: string;
  originalError?: unknown;
}

export interface VerificationResponse {
  message: string;
  user: User;
}

export interface SendCodeResponse {
  message: string;
  expiresIn: number; // seconds
}

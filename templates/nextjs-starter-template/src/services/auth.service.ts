import apiClient, { tokenManager } from './api.service';
import type {
  AuthResponse,
  LoginCredentials,
  SignupData,
  User,
  SendCodeResponse,
  VerificationResponse,
} from '@/types';

export const authService = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    const { tokens } = response.data;
    tokenManager.setTokens(tokens);
    return response.data;
  },

  register: async (data: SignupData): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/register', data);
    const { tokens } = response.data;
    tokenManager.setTokens(tokens);
    return response.data;
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      tokenManager.clearTokens();
    }
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },

  refreshToken: async (refreshToken: string): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/refresh', { refreshToken });
    const { tokens } = response.data;
    tokenManager.setTokens(tokens);
    return response.data;
  },

  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const response = await apiClient.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (token: string, password: string): Promise<{ message: string }> => {
    const response = await apiClient.post('/auth/reset-password', { token, password });
    return response.data;
  },

  sendVerificationCode: async (): Promise<SendCodeResponse> => {
    const response = await apiClient.post<SendCodeResponse>('/auth/send-verification-code');
    return response.data;
  },

  verifyEmail: async (code: string): Promise<VerificationResponse> => {
    const response = await apiClient.post<VerificationResponse>('/auth/verify-email', { code });
    return response.data;
  },
};

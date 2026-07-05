import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import i18n from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useLocaleStore } from '@/store/localeStore';
import type { ApiError } from '@/types';

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  const locale = useLocaleStore.getState().locale;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['Accept-Language'] = locale;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setAccessToken, clear } = useAuthStore.getState();
  if (!refreshToken) {
    clear();
    return null;
  }

  try {
    const response = await axios.post('/api/v1/auth/refresh', { refreshToken });
    const newToken: string = response.data?.data?.accessToken;
    if (newToken) {
      setAccessToken(newToken);
      return newToken;
    }
    clear();
    return null;
  } catch {
    clear();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthRoute = original?.url?.includes('/auth/');

    if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true;
      refreshPromise = refreshPromise ?? refreshAccessToken();
      const newToken = await refreshPromise;
      refreshPromise = null;

      if (newToken) {
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
        return api(original);
      }
    }

    return Promise.reject(error);
  },
);

export function extractErrorMessage(error: unknown, fallback?: string): string {
  const defaultFallback = fallback ?? i18n.t('common.unexpectedError');
  if (error instanceof AxiosError) {
    return error.response?.data?.error ?? error.message ?? defaultFallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return defaultFallback;
}

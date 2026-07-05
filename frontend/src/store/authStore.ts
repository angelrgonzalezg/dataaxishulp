import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  permissions: string[];
  setSession: (session: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
    permissions: string[];
  }) => void;
  setAccessToken: (accessToken: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      permissions: [],
      setSession: ({ accessToken, refreshToken, user, permissions }) =>
        set({ accessToken, refreshToken, user, permissions }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null, permissions: [] }),
    }),
    {
      name: 'dataaxis-hulp-auth',
    },
  ),
);

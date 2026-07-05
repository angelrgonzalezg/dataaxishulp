import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { login as loginRequest, logout as logoutRequest } from '@/api/auth.api';
import { useAuthStore } from '@/store/authStore';

export function useAuth() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const setSession = useAuthStore((state) => state.setSession);
  const clear = useAuthStore((state) => state.clear);

  async function login(username: string, password: string): Promise<void> {
    const session = await loginRequest(username, password);
    setSession(session);
  }

  async function logout(): Promise<void> {
    await logoutRequest();
    clear();
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  return {
    user,
    isAuthenticated: Boolean(accessToken),
    login,
    logout,
  };
}

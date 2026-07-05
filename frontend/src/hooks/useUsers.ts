import { useQuery } from '@tanstack/react-query';
import { fetchUsers, type UsersQuery } from '@/api/users.api';

export function useUsers(params: UsersQuery = {}) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => fetchUsers(params),
  });
}

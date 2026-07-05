import { api } from './client';
import type { Issue, IssueDetail, IssuePriority, IssueStatus, PaginationMeta } from '@/types';

export interface IssuesQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  system_id?: number;
}

export async function fetchIssues(params: IssuesQuery = {}) {
  const { data } = await api.get('/issues', { params });
  return {
    issues: data.data as Issue[],
    pagination: data.pagination as PaginationMeta,
  };
}

export async function fetchIssue(id: number) {
  const { data } = await api.get(`/issues/${id}`);
  return data.data as IssueDetail;
}

export async function createIssue(payload: {
  title: string;
  description: string;
  system_id: number;
  priority?: IssuePriority;
  category?: string;
  external_ref?: string;
  assigned_to_id?: number;
}) {
  const { data } = await api.post('/issues', payload);
  return data.data as IssueDetail;
}

export async function updateIssue(
  id: number,
  payload: Partial<{
    title: string;
    description: string;
    system_id: number;
    priority: IssuePriority;
    category: string | null;
    external_ref: string | null;
    assigned_to_id: number | null;
    status: IssueStatus;
    comment: string;
  }>,
) {
  const { data } = await api.patch(`/issues/${id}`, payload);
  return data.data as IssueDetail;
}

export async function resolveIssue(
  id: number,
  payload: { resolution_notes: string; status?: 'resolved' | 'closed' },
) {
  const { data } = await api.post(`/issues/${id}/resolve`, payload);
  return data.data as IssueDetail;
}

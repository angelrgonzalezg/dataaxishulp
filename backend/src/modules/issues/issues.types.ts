import type { IssuePriority, IssueStatus } from '../../types/database.types';
import type { PaginationMeta } from '../../types/api.types';

export interface IssueListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  system_id?: number;
  assigned_to_id?: number;
}

export interface IssueCreateInput {
  title: string;
  description: string;
  system_id: number;
  priority?: IssuePriority;
  category?: string;
  external_ref?: string;
  assigned_to_id?: number;
}

export interface IssueUpdateInput {
  title?: string;
  description?: string;
  system_id?: number;
  priority?: IssuePriority;
  category?: string | null;
  external_ref?: string | null;
  assigned_to_id?: number | null;
  status?: IssueStatus;
  comment?: string;
}

export interface IssueResolveInput {
  resolution_notes: string;
  status?: 'resolved' | 'closed';
}

export interface IssueUserSummary {
  user_id: number;
  username: string;
  full_name: string | null;
}

export interface IssueSystemSummary {
  system_id: number;
  system_key: string;
  name: string;
}

export interface IssueResponse {
  issue_id: number;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  category: string | null;
  external_ref: string | null;
  resolution_notes: string | null;
  system: IssueSystemSummary;
  created_by: IssueUserSummary;
  assigned_to: IssueUserSummary | null;
  resolved_by: IssueUserSummary | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface IssueHistoryResponse {
  history_id: number;
  action: string;
  from_status: string | null;
  to_status: string | null;
  comment: string | null;
  actor: IssueUserSummary;
  created_at: Date;
}

export interface IssueDetailResponse extends IssueResponse {
  history: IssueHistoryResponse[];
}

export interface IssueListResult {
  issues: IssueResponse[];
  pagination: PaginationMeta;
}

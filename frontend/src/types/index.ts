import type { Permission } from '@/config/permissions';

export type UserRole = 'admin' | 'agent' | 'viewer';
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical';

export interface AuthUser {
  user_id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: UserRole;
}

export interface AppUser extends AuthUser {
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  success: false;
  error: string;
  code: string;
  details?: unknown;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  permissions: Permission[];
}

export interface SystemConnection {
  system_id: number;
  system_key: string;
  name: string;
  description: string | null;
  env_var_name: string;
  host: string | null;
  port: number | null;
  database_name: string | null;
  is_active: boolean;
  is_production: boolean;
  has_connection_url: boolean;
  last_checked_at: string | null;
  last_status: string | null;
  last_error: string | null;
}

export interface IssueUserSummary {
  user_id: number;
  username: string;
  full_name: string | null;
}

export interface Issue {
  issue_id: number;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  category: string | null;
  external_ref: string | null;
  resolution_notes: string | null;
  system: {
    system_id: number;
    system_key: string;
    name: string;
  };
  created_by: IssueUserSummary;
  assigned_to: IssueUserSummary | null;
  resolved_by: IssueUserSummary | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IssueHistoryEntry {
  history_id: number;
  action: string;
  from_status: string | null;
  to_status: string | null;
  comment: string | null;
  actor: IssueUserSummary;
  created_at: string;
}

export interface IssueDetail extends Issue {
  history: IssueHistoryEntry[];
}

export interface TableColumnMeta {
  name: string;
  editable: boolean;
  isPrimaryKey: boolean;
}

export interface TableFrame {
  key: string;
  label: string;
  tableName: string;
  primaryKey: string;
  editable: boolean;
  section?: string;
  sectionLabel?: string;
  columns: TableColumnMeta[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface OrderCandidate {
  order_id: number;
  kenmerk: string | null;
  requester: string | null;
  request_type: string | null;
  register_date: string | null;
  register_title?: string | null;
}

export interface OrderSupportLookup {
  system_key: string;
  system_name: string;
  is_production: boolean;
  entry: 'order' | 'kenmerk' | 'register_deed';
  order_id: number;
  kenmerk?: string | null;
  register_title?: string | null;
  found: boolean;
  candidates?: OrderCandidate[];
  summary: {
    transaction_id: string | null;
    request_type: string | null;
    requester: string | null;
    register_date: string | null;
    status: string | null;
    product_count: number;
    parcel_count: number;
    kenmerk?: string | null;
    register_title?: string | null;
  } | null;
  frames: TableFrame[];
}

export interface ParcelSupportLookup {
  system_key: string;
  system_name: string;
  is_production: boolean;
  entry: 'parcel_number' | 'meet_brief';
  parcel_id: number;
  meet_brief: string | null;
  found: boolean;
  candidates?: Array<{
    parcel_id: number;
    meet_brief: string | null;
    location: string | null;
    status: string | null;
  }>;
  summary: {
    meet_brief: string | null;
    location: string | null;
    sheet: string | null;
    size: string | null;
    property_type: string | null;
    status: string | null;
    title_details: number;
    mortgage_details: number;
    seizure_details: number;
    limited_rights_details: number;
    share_details: number;
    order_links: number;
  } | null;
  frames: TableFrame[];
}

export interface DeedHistorySupportLookup {
  system_key: string;
  system_name: string;
  is_production: boolean;
  entry: 'deed_history';
  register_title: string;
  found: boolean;
  summary: {
    register_title: string;
    seed_deed_count: number;
    history_deed_count: number;
    history_deed_detail_count: number;
    parcel_count: number;
    subject_count: number;
    order_link_count: number;
    max_depth: number;
  };
  frames: TableFrame[];
}

export type SupportLookup = OrderSupportLookup | ParcelSupportLookup | DeedHistorySupportLookup;

export interface DashboardOverview {
  generated_at: string;
  totals: {
    issues: number;
    open: number;
    in_progress: number;
    resolved: number;
    closed: number;
    critical_open: number;
    systems: number;
  };
  by_system: Array<{ system_id: number; name: string; count: number }>;
  recent_issues: Array<{
    issue_id: number;
    title: string;
    status: string;
    priority: string;
    system_name: string;
    assigned_to: string | null;
    updated_at: string;
  }>;
}

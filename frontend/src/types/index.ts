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
  /** Schema profile: kadaster | tereno | bonaire */
  dialect: 'kadaster' | 'tereno' | 'bonaire';
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

export interface SystemHealth extends SystemConnection {
  response_ms: number | null;
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

export interface MondayColumnValue {
  column_id: string;
  column_title: string;
  text: string | null;
  value: string | null;
}

export interface MondayItem {
  monday_item_id: string;
  name: string;
  status: string | null;
  priority: string | null;
  assignee: string | null;
  group: string;
  board: string;
  updated_at: string | null;
  monday_url: string | null;
  columns: MondayColumnValue[];
}

export interface MondayBoardItemsResult {
  board_key: string;
  label: string;
  workspace: string;
  board: string;
  group: string;
  open_items: MondayItem[];
  done_items: MondayItem[];
  /** @deprecated Use open_items */
  items: MondayItem[];
  counts: {
    open: number;
    done: number;
    total: number;
  };
  local_issue_by_monday_id: Record<string, number>;
}

export interface MondayDashboardSummary {
  configured: boolean;
  workspace: string | null;
  last_synced_at: string | null;
  totals: {
    open: number;
    done: number;
    total: number;
    imported_local: number;
  };
  by_board: Array<{
    board_key: string;
    label: string;
    open: number;
    done: number;
    total: number;
  }>;
}

export interface MondayAllItemsResult {
  workspace: string;
  synced_at: string;
  boards: MondayBoardItemsResult[];
}

/** @deprecated Use MondayBoardItemsResult */
export type MondayItemsResult = MondayBoardItemsResult;

export interface MondayImportResult {
  issue_id: number;
  created: boolean;
  board_key: string;
  monday_item: MondayItem;
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
  dialect: string;
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
    linked_parcels?: Array<{
      parcel_id: number;
      meet_brief: string | null;
      description: string | null;
      location: string | null;
      status: string | null;
    }>;
  } | null;
  frames: TableFrame[];
}

export interface ParcelSupportLookup {
  system_key: string;
  system_name: string;
  dialect: string;
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
    description: string | null;
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
    linked_orders?: Array<{
      order_id: number;
      transaction_id: string | null;
      notary_code: string | null;
      requester: string | null;
      register_date: string | null;
      product_count: number;
    }>;
    split_role?: 'source' | 'result' | 'none';
    split_flag?: boolean;
    split_child_count?: number;
    split_child_esris?: string[];
    split_parent_parcel_id?: number | null;
    split_parent_esri?: string | null;
  } | null;
  frames: TableFrame[];
}

export interface LegalFactOption {
  id: number;
  code: string | null;
  name_nl: string | null;
  name_en: string | null;
}

export interface DeedLegalFactState {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  deed_id: number;
  register: string | null;
  segment: number | null;
  number: number | null;
  legal_fact_id: number | null;
  legal_fact_code: string | null;
  legal_fact_name_nl: string | null;
  legal_fact_name_en: string | null;
}

export interface UpdateDeedLegalFactResult {
  deed_id: number;
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  previous: LegalFactOption | null;
  next: LegalFactOption;
}

export interface DeedTypeAkteOption {
  deedId: number;
  title: string;
  legalFactId: number | null;
  legalFactCode: string | null;
  legalFactNameNl: string | null;
}

export interface DeedHistorySupportLookup {
  system_key: string;
  system_name: string;
  dialect: string;
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

export type InzageObjectVariant = 'object' | 'object_beperkt' | 'her' | 'na';
export type InzageSubjectVariant = 'subject' | 'negatief';

export interface InzageDeedRef {
  register: string | null;
  segment: number | null;
  number: number | null;
}

export interface InzageParty {
  name: string;
  share: string | null;
  role: string | null;
}

export interface InzageEntry {
  parties: InzageParty[];
  legalFact: string | null;
  obtainedLabel: string | null;
  typeDescription: string | null;
  deedDate: string | null;
  submissionDate: string | null;
  notary: string | null;
  note: string | null;
  amount: string | null;
  deed: InzageDeedRef;
  extraLines: string[];
  sourceDeeds: InzageDeedRef[];
}

export interface InzageSection {
  key: string;
  heading: string;
  emptyText: string | null;
  entries: InzageEntry[];
}

export interface InzageObjectReport {
  kind: 'object';
  variant: InzageObjectVariant;
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  title: string;
  generated_at: string;
  header: {
    parcel_id: number;
    esri: string | null;
    description: string | null;
    size: string | null;
    sheet: string | null;
    diamond_letter: string | null;
    location: string | null;
    status: string | null;
    particulars: string | null;
    split_flag: boolean;
    is_reviewed: boolean;
    split_role?: 'source' | 'result' | 'none';
    split_child_esris?: string[];
    split_parent_esri?: string | null;
    split_parent_parcel_id?: number | null;
  };
  sections: InzageSection[];
  linked_subjects: Array<{ subject_id: number; name: string }>;
}

export interface InzageSubjectRight {
  index: number;
  parcel_id: number | null;
  esri: string | null;
  size: string | null;
  description: string | null;
  location: string | null;
  sheet: string | null;
  diamond_letter: string | null;
  share: string | null;
  legal_fact_type: string | null;
  obtained_at: string | null;
  akte: string | null;
  price: string | null;
  submission_date: string | null;
  deed_date: string | null;
  notary: string | null;
}

export interface InzageSubjectReport {
  kind: 'subject';
  variant: InzageSubjectVariant;
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  title: string;
  generated_at: string;
  person: {
    subject_id: number;
    is_natural_person: boolean;
    name: string;
    gender: string | null;
    occupation: string | null;
    date_of_birth: string | null;
    place_of_birth: string | null;
    country: string | null;
    organizational_structure: string | null;
    address: string | null;
  };
  rights: InzageSubjectRight[];
  declaration: string | null;
}

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
  monday: MondayDashboardSummary | null;
  by_system: Array<{ system_id: number; name: string; count: number }>;
  recent_issues: Array<{
    issue_id: number;
    title: string;
    status: string;
    priority: string;
    system_name: string;
    assigned_to: string | null;
    updated_at: string;
    source?: 'monday' | 'local';
  }>;
}

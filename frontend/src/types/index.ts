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

export interface HostResourceHealth {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  used_percent: number;
}

export interface LocalHostHealth {
  online: true;
  hostname: string;
  os: string;
  arch: string;
  uptime_seconds: number;
  cpu_usage_percent: number | null;
  memory: HostResourceHealth;
  disk: (HostResourceHealth & { path: string }) | null;
  internet: {
    online: boolean;
    latency_ms: number | null;
    error: string | null;
  };
  checked_at: string;
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
  stale_threshold_days?: number;
  totals: {
    open: number;
    done: number;
    total: number;
    imported_local: number;
    stale_open?: number;
  };
  by_board: Array<{
    board_key: string;
    label: string;
    group?: string;
    open: number;
    done: number;
    total: number;
    stale_open?: number;
  }>;
  stale_items?: Array<{
    id: string;
    title: string;
    board_key: string;
    board_label: string;
    group?: string;
    assignee?: string | null;
    updated_at: string | null;
    days_stale: number;
    url: string | null;
  }>;
  assignees?: string[];
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

export interface JiraItem {
  jira_issue_id: string;
  jira_issue_key: string;
  name: string;
  status: string | null;
  status_category: string | null;
  priority: string | null;
  assignee: string | null;
  issue_type: string | null;
  project: string;
  updated_at: string | null;
  jira_url: string | null;
}

export interface JiraProjectItemsResult {
  project_key: string;
  label: string;
  site: string;
  jira_project_key: string;
  open_items: JiraItem[];
  done_items: JiraItem[];
  items: JiraItem[];
  counts: {
    open: number;
    done: number;
    total: number;
  };
  local_issue_by_jira_key: Record<string, number>;
}

export interface JiraDashboardSummary {
  configured: boolean;
  site: string | null;
  last_synced_at: string | null;
  error?: string | null;
  stale_threshold_days?: number;
  totals: {
    open: number;
    done: number;
    total: number;
    imported_local: number;
    stale_open?: number;
  };
  by_project: Array<{
    project_key: string;
    jira_project_key?: string;
    label: string;
    open: number;
    done: number;
    total: number;
    stale_open?: number;
  }>;
  stale_items?: Array<{
    id: string;
    key: string;
    title: string;
    project_key: string;
    project_label: string;
    assignee?: string | null;
    updated_at: string | null;
    days_stale: number;
    url: string | null;
  }>;
  assignees?: string[];
}

export interface JiraAllItemsResult {
  site: string;
  synced_at: string;
  projects: JiraProjectItemsResult[];
}

export interface JiraImportResult {
  issue_id: number;
  created: boolean;
  project_key: string;
  jira_item: JiraItem;
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

export interface NotaryOption {
  id: number;
  code: string | null;
  name: string | null;
  active: boolean | null;
}

export interface DeedNotaryState {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  deed_id: number;
  register: string | null;
  segment: number | null;
  number: number | null;
  notary_id: number | null;
  notary_code: string | null;
  notary_name: string | null;
}

export interface NotarySearchResult {
  query: string;
  candidates: NotaryOption[];
}

export interface ChangeDeedNotaryResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  deed_id: number;
  preview_only: boolean;
  register: string | null;
  segment: number | null;
  number: number | null;
  from_notary: NotaryOption | null;
  to_notary: NotaryOption;
}

export interface FrameCellChange {
  column: string;
  from: unknown;
  to: unknown;
}

export interface FrameRowChange {
  primary_key_value: string | number;
  cells: FrameCellChange[];
}

export interface UpdateFrameRowsResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  table_name: string;
  primary_key: string;
  preview_only: boolean;
  change_count: number;
  row_count: number;
  changes: FrameRowChange[];
  rows_affected: number;
}

export interface ReopenBestellingChange {
  action_type: string | null;
  order_id: number | null;
  order_product_id: number | null;
  product_id: string | null;
  product_number: number | null;
  product_code: string | null;
  product_name: string | null;
  from_status_id: number | null;
  from_status: string | null;
  to_status_id: number | null;
  to_status: string | null;
  detail: string | null;
  raw: Record<string, unknown>;
}

export interface ReopenBestellingResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  preview_only: boolean;
  return_value: number | null;
  change_count: number;
  changes: ReopenBestellingChange[];
  rows: Record<string, unknown>[];
}

export interface VoidOrderProductChange {
  order_product_id: number;
  product_code: string | null;
  product_name: string | null;
  from_status_id: number | null;
  from_status: string | null;
  to_status_id: number;
  to_status: string | null;
  raw: Record<string, unknown>;
}

export interface VoidOrderRegistryRisk {
  table: string;
  count: number;
  detail: string;
}

export interface VoidOrderResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  preview_only: boolean;
  void_status_id: number;
  order_from_status_id: number | null;
  order_from_status: string | null;
  order_to_status_id: number;
  order_to_status: string | null;
  product_change_count: number;
  product_changes: VoidOrderProductChange[];
  is_safe: boolean;
  risks: VoidOrderRegistryRisk[];
  warnings: string[];
  already_voided: boolean;
}

export interface VerifyOrderDeedLine {
  order_deed_id: number | null;
  order_product_id: number | null;
  deed_id: number | null;
  title: string | null;
  amount: number | null;
  price: number | null;
  unit_price: number | null;
  product_code: string | null;
  product_name: string | null;
}

export interface VerifyOrderPriceCheck {
  check_key: 'order_deed_price_vs_order_total';
  ok: boolean;
  order_total_price: number | null;
  order_deed_price_sum: number;
  difference: number | null;
  tolerance: number;
  line_count: number;
  lines: VerifyOrderDeedLine[];
  message: string;
}

export interface VerifyOrderResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  checks: VerifyOrderPriceCheck[];
  all_ok: boolean;
}

export interface OrderParcelLink {
  link_id: number;
  order_product_id: number;
  parcel_id: number | null;
  parcel_esri: string | null;
  parcel_location: string | null;
  parcel_status: string | null;
  raw: Record<string, unknown>;
}

export interface OrderParcelLinksResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  links: OrderParcelLink[];
}

export interface ParcelEsriCandidate {
  parcel_id: number;
  parcel_esri: string | null;
  location: string | null;
  status: string | null;
}

export interface ParcelEsriSearchResult {
  parcel_id: number;
  parcel_esri: string | null;
  candidates: ParcelEsriCandidate[];
}

export interface ChangeOrderParcelResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  preview_only: boolean;
  link_id: number;
  order_product_id: number;
  from_parcel_id: number | null;
  from_parcel_esri: string | null;
  to_parcel_id: number;
  to_parcel_esri: string | null;
  raw: Record<string, unknown>;
}

export interface OrderDeedLink {
  link_id: number;
  order_product_id: number;
  deed_id: number | null;
  register_title: string | null;
  akte: string | null;
  raw: Record<string, unknown>;
}

export interface OrderDeedLinksResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  links: OrderDeedLink[];
}

export interface DeedTitleCandidate {
  deed_id: number;
  register_title: string;
  approval_id: number | null;
}

export interface DeedTitleSearchResult {
  register_title: string;
  candidates: DeedTitleCandidate[];
}

export interface ChangeOrderDeedResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  order_id: number;
  preview_only: boolean;
  link_id: number;
  order_product_id: number;
  from_deed_id: number | null;
  from_register_title: string | null;
  from_akte: string | null;
  to_deed_id: number;
  to_register_title: string;
  to_akte: string;
  raw: Record<string, unknown>;
}

export interface DeedTitleOccupancy {
  deed_id: number;
  register_title: string;
  register: string | null;
  segment: number | null;
  number: number | null;
  approval_id: number | null;
  is_retired: boolean;
  legal_fact_code: string | null;
  legal_fact_name: string | null;
  deed_detail_count: number;
  a_register_count: number;
  order_link_count: number;
  register_row_count: number;
  deed_document_count: number;
  extra_link_count: number;
  is_orphan: boolean;
  block_reasons: string[];
}

export interface CorrectRegisterTitleResult {
  system_key: string;
  system_name: string;
  dialect: string;
  island: string;
  is_production: boolean;
  preview_only: boolean;
  can_apply: boolean;
  from_title: string;
  to_title: string;
  source: DeedTitleOccupancy;
  occupying: DeedTitleOccupancy | null;
  will_release_orphan: boolean;
  will_update_akte_links: number;
  will_update_register_rows: number;
  actions: string[];
  blockers: string[];
  island_notes: string[];
}

export interface RetireSubjectCandidate {
  deed_detail_id: number;
  deed_id: number;
  register_title: string;
  parcel_id: number;
  parcel_esri: string | null;
  subject_id: number;
  subject_name: string;
  share_numerator: number | null;
  share_denominator: number | null;
  is_retired: boolean;
  legal_fact_type_id: number | null;
}

export interface OwnershipShareValidation {
  is_valid: boolean;
  active_count: number;
  total_numerator: number | null;
  total_denominator: number | null;
  total_display: string | null;
  total_decimal: number | null;
  expected_display: '1/1';
  incomplete_share_count: number;
  message: string;
}

export interface RetireSubjectLookupResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  register_title: string;
  parcel_esri: string;
  deed_ids: number[];
  parcel_ids: number[];
  candidates: RetireSubjectCandidate[];
  share_validation: OwnershipShareValidation;
}

export interface RetireSubjectChange {
  deed_detail_id: number;
  deed_id: number;
  register_title: string | null;
  parcel_id: number | null;
  parcel_esri: string | null;
  subject_id: number;
  subject_name: string;
  from_is_retired: boolean;
  to_is_retired: true;
  raw: Record<string, unknown>;
}

export interface RetireSubjectResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  preview_only: boolean;
  change_count: number;
  changes: RetireSubjectChange[];
  share_validation: OwnershipShareValidation;
  remaining_active: RetireSubjectCandidate[];
}

export interface CorrectOwnershipShareResult {
  system_key: string;
  system_name: string;
  dialect: string;
  is_production: boolean;
  preview_only: boolean;
  deed_detail_id: number;
  subject_id: number;
  subject_name: string;
  from_share_numerator: number | null;
  from_share_denominator: number | null;
  to_share_numerator: number;
  to_share_denominator: number;
  share_validation: OwnershipShareValidation;
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
  stale_threshold_days?: number;
  totals: {
    issues: number;
    open: number;
    in_progress: number;
    resolved: number;
    closed: number;
    critical_open: number;
    stale_open?: number;
    systems: number;
  };
  monday: MondayDashboardSummary | null;
  jira: JiraDashboardSummary | null;
  by_system: Array<{ system_id: number; name: string; count: number }>;
  recent_issues: Array<{
    issue_id: number;
    title: string;
    status: string;
    priority: string;
    system_name: string;
    assigned_to: string | null;
    updated_at: string;
    source?: 'monday' | 'jira' | 'local';
  }>;
  stale_issues?: Array<{
    issue_id: number;
    title: string;
    status: string;
    priority: string;
    system_name: string;
    assigned_to: string | null;
    updated_at: string;
    days_stale: number;
    source?: 'monday' | 'jira' | 'local';
  }>;
}

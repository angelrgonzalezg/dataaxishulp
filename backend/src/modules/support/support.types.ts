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
  /** Column editing will be enabled in a later step */
  editable: boolean;
  /** Logical group, e.g. andere_details_titles */
  section?: string;
  sectionLabel?: string;
  columns: TableColumnMeta[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface SupportLookupBase {
  system_key: string;
  system_name: string;
  is_production: boolean;
  found: boolean;
  frames: TableFrame[];
}

export interface OrderCandidate {
  order_id: number;
  kenmerk: string | null;
  requester: string | null;
  request_type: string | null;
  register_date: string | null;
  register_title?: string | null;
}

export interface OrderSupportLookup extends SupportLookupBase {
  entry: 'order' | 'kenmerk' | 'register_deed';
  order_id: number;
  kenmerk?: string | null;
  register_title?: string | null;
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
}

export interface DeedHistorySupportLookup extends SupportLookupBase {
  entry: 'deed_history';
  register_title: string;
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
}

export interface ParcelSupportLookup extends SupportLookupBase {
  entry: 'parcel_number' | 'meet_brief';
  parcel_id: number;
  meet_brief: string | null;
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
    /** Split detection (Tereno / usp_SplitParcel_CopyFromOldParcel). */
    split_role?: 'source' | 'result' | 'none';
    split_flag?: boolean;
    split_child_count?: number;
    split_child_esris?: string[];
    split_parent_parcel_id?: number | null;
    split_parent_esri?: string | null;
  } | null;
}

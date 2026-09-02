export interface JiraItemDto {
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
  open_items: JiraItemDto[];
  done_items: JiraItemDto[];
  items: JiraItemDto[];
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
  stale_threshold_days: number;
  totals: {
    open: number;
    done: number;
    total: number;
    imported_local: number;
    stale_open: number;
  };
  by_project: Array<{
    project_key: string;
    jira_project_key: string;
    label: string;
    open: number;
    done: number;
    total: number;
    stale_open: number;
  }>;
  stale_items: Array<{
    id: string;
    key: string;
    title: string;
    project_key: string;
    project_label: string;
    updated_at: string | null;
    days_stale: number;
    url: string | null;
  }>;
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
  jira_item: JiraItemDto;
}

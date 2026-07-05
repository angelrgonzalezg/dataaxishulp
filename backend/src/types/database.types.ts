export type UserRole = 'admin' | 'agent' | 'viewer';

export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type IssuePriority = 'low' | 'medium' | 'high' | 'critical';

export const USER_ROLES: UserRole[] = ['admin', 'agent', 'viewer'];

export const ISSUE_STATUSES: IssueStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

export const ISSUE_PRIORITIES: IssuePriority[] = ['low', 'medium', 'high', 'critical'];

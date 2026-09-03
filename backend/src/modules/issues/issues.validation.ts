import { z } from 'zod';
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from '../../types/database.types';

export const issueListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  status: z.enum(ISSUE_STATUSES as [string, ...string[]]).optional(),
  priority: z.enum(ISSUE_PRIORITIES as [string, ...string[]]).optional(),
  system_id: z.coerce.number().int().positive().optional(),
  assigned_to_id: z.coerce.number().int().positive().optional(),
});

export const issueCreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(1),
  system_id: z.number().int().positive(),
  priority: z.enum(ISSUE_PRIORITIES as [string, ...string[]]).optional(),
  category: z.string().max(80).optional(),
  external_ref: z.string().max(120).optional(),
  assigned_to_id: z.number().int().positive().optional(),
});

export const issueUpdateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(1).optional(),
  system_id: z.number().int().positive().optional(),
  priority: z.enum(ISSUE_PRIORITIES as [string, ...string[]]).optional(),
  category: z.string().max(80).nullable().optional(),
  external_ref: z.string().max(120).nullable().optional(),
  assigned_to_id: z.number().int().positive().nullable().optional(),
  status: z.enum(ISSUE_STATUSES as [string, ...string[]]).optional(),
  comment: z.string().optional(),
});

export const issueResolveSchema = z.object({
  resolution_notes: z.string().min(1),
  status: z.enum(['resolved', 'closed']).optional(),
});

export const issueIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const mondayItemIdParamsSchema = z.object({
  mondayItemId: z.string().min(1).max(40),
});

export const mondayBoardQuerySchema = z.object({
  boardKey: z.string().min(1).max(40).optional(),
  includeDone: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const mondayImportQuerySchema = z.object({
  boardKey: z.string().min(1).max(40),
});

export const jiraIssueKeyParamsSchema = z.object({
  jiraIssueKey: z.string().min(1).max(40),
});

export const jiraProjectQuerySchema = z.object({
  projectKey: z.string().min(1).max(40).optional(),
  includeDone: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const jiraImportQuerySchema = z.object({
  projectKey: z.string().min(1).max(40),
});

import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ValidationError } from '../../utils/AppError';
import { successResponse } from '../../types/api.types';
import * as issuesService from './issues.service';
import type {
  IssueCreateInput,
  IssueListQuery,
  IssueResolveInput,
  IssueUpdateInput,
} from './issues.types';
import * as mondayService from '../monday/monday.service';
import * as jiraService from '../jira/jira.service';

function actorId(req: Request): number {
  if (!req.user) throw new UnauthorizedError();
  return req.user.userId;
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await issuesService.listIssues(req.query as unknown as IssueListQuery);
    res.json(successResponse(result.issues, undefined, result.pagination));
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const issue = await issuesService.getIssueById(Number(req.params.id));
    res.json(successResponse(issue));
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const issue = await issuesService.createIssue(req.body as IssueCreateInput, actorId(req));
    res.status(201).json(successResponse(issue, 'Issue created'));
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const issue = await issuesService.updateIssue(
      Number(req.params.id),
      req.body as IssueUpdateInput,
      actorId(req),
    );
    res.json(successResponse(issue, 'Issue updated'));
  } catch (error) {
    next(error);
  }
}

export async function resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const issue = await issuesService.resolveIssue(
      Number(req.params.id),
      req.body as IssueResolveInput,
      actorId(req),
    );
    res.json(successResponse(issue, 'Issue resolved'));
  } catch (error) {
    next(error);
  }
}

export async function listMondayItems(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = req.query as { boardKey?: string; includeDone?: boolean };
    const result = await mondayService.listMondayItems(query.boardKey, {
      includeDone: query.includeDone ?? false,
    });
    res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
}

export async function importMondayItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const boardKey = typeof req.query.boardKey === 'string' ? req.query.boardKey.trim() : '';
    if (!boardKey) {
      throw new ValidationError('boardKey query parameter is required');
    }
    const result = await mondayService.importMondayItem(
      String(req.params.mondayItemId),
      boardKey,
      actorId(req),
    );
    res.status(result.created ? 201 : 200).json(
      successResponse(result, result.created ? 'Issue created from Monday item' : 'Issue already linked'),
    );
  } catch (error) {
    next(error);
  }
}

export async function listJiraItems(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = req.query as { projectKey?: string; includeDone?: boolean };
    const result = await jiraService.listJiraItems(query.projectKey, {
      includeDone: query.includeDone ?? false,
    });
    res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
}

export async function importJiraItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const projectKey =
      typeof req.query.projectKey === 'string' ? req.query.projectKey.trim() : '';
    if (!projectKey) {
      throw new ValidationError('projectKey query parameter is required');
    }
    const result = await jiraService.importJiraItem(
      String(req.params.jiraIssueKey),
      projectKey,
      actorId(req),
    );
    res.status(result.created ? 201 : 200).json(
      successResponse(
        result,
        result.created ? 'Issue created from Jira issue' : 'Issue already linked',
      ),
    );
  } catch (error) {
    next(error);
  }
}

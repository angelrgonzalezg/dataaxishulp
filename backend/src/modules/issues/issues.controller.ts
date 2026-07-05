import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../utils/AppError';
import { successResponse } from '../../types/api.types';
import * as issuesService from './issues.service';
import type {
  IssueCreateInput,
  IssueListQuery,
  IssueResolveInput,
  IssueUpdateInput,
} from './issues.types';

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

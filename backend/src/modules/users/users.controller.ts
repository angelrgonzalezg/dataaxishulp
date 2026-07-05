import type { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../types/api.types';
import * as usersService from './users.service';
import type { UserCreateInput, UserListQuery, UserUpdateInput } from './users.types';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await usersService.listUsers(req.query as unknown as UserListQuery);
    res.json(successResponse(result.users, undefined, result.pagination));
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await usersService.getUserById(Number(req.params.id));
    res.json(successResponse(user));
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await usersService.createUser(req.body as UserCreateInput);
    res.status(201).json(successResponse(user, 'User created'));
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await usersService.updateUser(Number(req.params.id), req.body as UserUpdateInput);
    res.json(successResponse(user, 'User updated'));
  } catch (error) {
    next(error);
  }
}

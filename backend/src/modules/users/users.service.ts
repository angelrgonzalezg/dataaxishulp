import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db';
import { mapUser } from '../../utils/userMapper';
import { ConflictError, NotFoundError } from '../../utils/AppError';
import type {
  UserCreateInput,
  UserListQuery,
  UserListResult,
  UserResponse,
  UserUpdateInput,
} from './users.types';

const BCRYPT_ROUNDS = 12;

function normalizePagination(page = 1, limit = 20): { page: number; limit: number; skip: number } {
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

export async function listUsers(query: UserListQuery): Promise<UserListResult> {
  const { page, limit, skip } = normalizePagination(query.page, query.limit);
  const where = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.is_active !== undefined ? { isActive: query.is_active } : {}),
    ...(query.search
      ? {
          OR: [
            { username: { contains: query.search } },
            { email: { contains: query.search } },
            { fullName: { contains: query.search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { username: 'asc' }],
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: rows.map(mapUser),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getUserById(userId: number): Promise<UserResponse> {
  const row = await prisma.user.findUnique({ where: { userId } });
  if (!row) throw new NotFoundError('User not found');
  return mapUser(row);
}

async function assertUniqueUsernameEmail(
  username: string,
  email: string,
  excludeUserId?: number,
): Promise<void> {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email }],
      ...(excludeUserId ? { NOT: { userId: excludeUserId } } : {}),
    },
  });
  if (existing) {
    if (existing.username === username) throw new ConflictError('Username already exists');
    throw new ConflictError('Email already exists');
  }
}

export async function createUser(input: UserCreateInput): Promise<UserResponse> {
  await assertUniqueUsernameEmail(input.username, input.email);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const row = await prisma.user.create({
    data: {
      username: input.username,
      email: input.email,
      passwordHash,
      fullName: input.full_name,
      role: input.role,
    },
  });
  return mapUser(row);
}

export async function updateUser(userId: number, input: UserUpdateInput): Promise<UserResponse> {
  const existing = await prisma.user.findUnique({ where: { userId } });
  if (!existing) throw new NotFoundError('User not found');

  if (input.email && input.email !== existing.email) {
    await assertUniqueUsernameEmail(existing.username, input.email, userId);
  }

  const passwordHash = input.password
    ? await bcrypt.hash(input.password, BCRYPT_ROUNDS)
    : undefined;

  const row = await prisma.user.update({
    where: { userId },
    data: {
      ...(input.email !== undefined && { email: input.email }),
      ...(input.full_name !== undefined && { fullName: input.full_name }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.is_active !== undefined && { isActive: input.is_active }),
      ...(passwordHash && { passwordHash }),
    },
  });

  return mapUser(row);
}

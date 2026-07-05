import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../config/jwt';
import { getPermissionsForRole } from '../../config/permissions';
import { validate } from '../../middleware/validate';
import { successResponse } from '../../types/api.types';
import { UnauthorizedError } from '../../utils/AppError';
import type { UserRole } from '../../types/database.types';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findFirst({
      where: { username, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const role = user.role as UserRole;
    const accessToken = signAccessToken({
      userId: user.userId,
      username: user.username,
      role,
    });
    const refreshToken = signRefreshToken({ userId: user.userId });

    res.json(
      successResponse(
        {
          accessToken,
          refreshToken,
          user: {
            user_id: user.userId,
            username: user.username,
            email: user.email,
            full_name: user.fullName,
            role: user.role,
          },
          permissions: getPermissionsForRole(role),
        },
        'Login successful',
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
    const payload = verifyRefreshToken(refreshToken);

    const user = await prisma.user.findFirst({
      where: { userId: payload.userId, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const accessToken = signAccessToken({
      userId: user.userId,
      username: user.username,
      role: user.role as UserRole,
    });

    res.json(successResponse({ accessToken }, 'Token refreshed'));
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (_req, res) => {
  res.json(successResponse(null, 'Logged out successfully'));
});

export default router;

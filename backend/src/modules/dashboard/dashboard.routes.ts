import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import { successResponse } from '../../types/api.types';
import { getDashboardOverview } from './dashboard.service';

const router = Router();

router.get('/overview', requirePermission('dashboard.view'), async (_req, res, next) => {
  try {
    const data = await getDashboardOverview();
    res.json(successResponse(data));
  } catch (error) {
    next(error);
  }
});

export default router;

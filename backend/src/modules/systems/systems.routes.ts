import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { successResponse } from '../../types/api.types';
import { getLocalHostHealth } from './hostHealth.service';
import * as systemsService from './systems.service';

const router = Router();

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

router.get('/', requirePermission('systems.view'), async (_req, res, next) => {
  try {
    const systems = await systemsService.listSystems();
    res.json(successResponse(systems));
  } catch (error) {
    next(error);
  }
});

router.get('/health', requirePermission('systems.view'), async (_req, res, next) => {
  try {
    const systems = await systemsService.checkAllSystemsHealth();
    res.json(successResponse(systems));
  } catch (error) {
    next(error);
  }
});

router.get('/host-health', requirePermission('systems.view'), async (_req, res, next) => {
  try {
    const host = await getLocalHostHealth();
    res.json(successResponse(host));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requirePermission('systems.view'), validate(idParamsSchema, 'params'), async (req, res, next) => {
  try {
    const system = await systemsService.getSystemById(Number(req.params.id));
    res.json(successResponse(system));
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:id/test',
  requirePermission('systems.manage'),
  validate(idParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const system = await systemsService.testSystemConnection(Number(req.params.id));
      res.json(successResponse(system, system.last_status === 'online' ? 'Connection OK' : 'Connection failed'));
    } catch (error) {
      next(error);
    }
  },
);

export default router;

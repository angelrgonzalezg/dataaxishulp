import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { successResponse } from '../../types/api.types';
import { ValidationError } from '../../utils/AppError';
import * as opsMonitor from './opsMonitor.service';
import { sendTestWhatsAppAlert } from './opsNotifier';
import { heartbeatPresence, listActivePresences } from './opsPresence.service';

const router = Router();

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const intervalSchema = z.object({
  check_interval_sec: z.number().int().min(15).max(3600),
});

router.post('/presence', requirePermission('dashboard.view'), async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    await heartbeatPresence({ userId: req.user.userId, username: req.user.username });
    const users = await listActivePresences('dataaxishulp');
    res.json(successResponse(users));
  } catch (error) {
    next(error);
  }
});

router.get('/', requirePermission('systems.view'), async (_req, res, next) => {
  try {
    const overview = await opsMonitor.getOverview();
    res.json(successResponse(overview));
  } catch (error) {
    next(error);
  }
});

router.get('/targets', requirePermission('systems.view'), async (_req, res, next) => {
  try {
    const targets = await opsMonitor.listTargets();
    res.json(successResponse(targets));
  } catch (error) {
    next(error);
  }
});

router.post('/alerts/test', requirePermission('systems.view'), async (_req, res, next) => {
  try {
    const result = await sendTestWhatsAppAlert();
    res.json(successResponse(result, `WhatsApp test sent to ${result.to.join(', ')}`));
  } catch (error) {
    next(error instanceof Error ? new ValidationError(error.message) : error);
  }
});

router.post('/probe', requirePermission('systems.view'), async (_req, res, next) => {
  try {
    const targets = await opsMonitor.probeTargets({ force: true });
    res.json(successResponse(targets, 'Ops probe completed'));
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/interval',
  requirePermission('systems.view'),
  validate(intervalSchema),
  async (req, res, next) => {
    try {
      const overview = await opsMonitor.updateCheckInterval(req.body.check_interval_sec);
      res.json(successResponse(overview, 'Probe interval updated'));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/targets/:id/logs',
  requirePermission('systems.view'),
  validate(idParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const logs = await opsMonitor.listTargetLogs(Number(req.params.id));
      res.json(successResponse(logs));
    } catch (error) {
      next(error);
    }
  },
);

export default router;

import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './issues.controller';
import {
  issueCreateSchema,
  issueIdParamsSchema,
  issueListQuerySchema,
  issueResolveSchema,
  issueUpdateSchema,
  mondayBoardQuerySchema,
  mondayItemIdParamsSchema,
} from './issues.validation';

const router = Router();

router.get('/', requirePermission('issues.view'), validate(issueListQuerySchema, 'query'), controller.list);
router.get('/monday/items', requirePermission('issues.view'), validate(mondayBoardQuerySchema, 'query'), controller.listMondayItems);
router.post(
  '/monday/items/:mondayItemId/import',
  requirePermission('issues.create'),
  validate(mondayItemIdParamsSchema, 'params'),
  controller.importMondayItem,
);
router.get('/:id', requirePermission('issues.view'), validate(issueIdParamsSchema, 'params'), controller.getById);
router.post('/', requirePermission('issues.create'), validate(issueCreateSchema), controller.create);
router.patch(
  '/:id',
  requirePermission('issues.edit'),
  validate(issueIdParamsSchema, 'params'),
  validate(issueUpdateSchema),
  controller.update,
);
router.post(
  '/:id/resolve',
  requirePermission('issues.resolve'),
  validate(issueIdParamsSchema, 'params'),
  validate(issueResolveSchema),
  controller.resolve,
);

export default router;

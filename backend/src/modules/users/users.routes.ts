import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './users.controller';
import {
  userCreateSchema,
  userIdParamsSchema,
  userListQuerySchema,
  userUpdateSchema,
} from './users.validation';

const router = Router();

router.get('/', requirePermission('users.view'), validate(userListQuerySchema, 'query'), controller.list);
router.get('/:id', requirePermission('users.view'), validate(userIdParamsSchema, 'params'), controller.getById);
router.post('/', requirePermission('users.create'), validate(userCreateSchema), controller.create);
router.patch(
  '/:id',
  requirePermission('users.edit'),
  validate(userIdParamsSchema, 'params'),
  validate(userUpdateSchema),
  controller.update,
);

export default router;

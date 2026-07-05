import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import usersRoutes from '../modules/users/users.routes';
import issuesRoutes from '../modules/issues/issues.routes';
import systemsRoutes from '../modules/systems/systems.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import supportRoutes from '../modules/support/support.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' }, message: 'DataAxis Hulp API is running' });
});

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/issues', issuesRoutes);
router.use('/systems', systemsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/support', supportRoutes);

export default router;

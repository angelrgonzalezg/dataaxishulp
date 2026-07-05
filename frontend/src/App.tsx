import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RequirePermission } from '@/components/RequirePermission';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { SupportCenterPage } from '@/pages/support/SupportCenterPage';
import { IssuesListPage } from '@/pages/issues/IssuesListPage';
import { IssueCreatePage } from '@/pages/issues/IssueCreatePage';
import { IssueDetailPage } from '@/pages/issues/IssueDetailPage';
import { SystemsPage } from '@/pages/systems/SystemsPage';
import { UsersListPage } from '@/pages/users/UsersListPage';
import { UserCreatePage } from '@/pages/users/UserCreatePage';
import { UserEditPage } from '@/pages/users/UserEditPage';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: '/',
            element: (
              <RequirePermission permission="dashboard.view">
                <DashboardPage />
              </RequirePermission>
            ),
            handle: { titleKey: 'route.dashboard.title', subtitleKey: 'route.dashboard.subtitle' },
          },
          {
            path: '/support',
            element: (
              <RequirePermission permission="support.view">
                <SupportCenterPage />
              </RequirePermission>
            ),
            handle: { titleKey: 'route.support.title', subtitleKey: 'route.support.subtitle' },
          },
          {
            path: '/issues',
            element: (
              <RequirePermission permission="issues.view">
                <IssuesListPage />
              </RequirePermission>
            ),
            handle: { titleKey: 'route.issues.title', subtitleKey: 'route.issues.subtitle' },
          },
          {
            path: '/issues/new',
            element: (
              <RequirePermission permission="issues.create">
                <IssueCreatePage />
              </RequirePermission>
            ),
            handle: { titleKey: 'route.issuesNew.title', subtitleKey: 'route.issuesNew.subtitle' },
          },
          {
            path: '/issues/:id',
            element: (
              <RequirePermission permission="issues.view">
                <IssueDetailPage />
              </RequirePermission>
            ),
            handle: {
              titleKey: 'route.issuesDetail.title',
              subtitleKey: 'route.issuesDetail.subtitle',
            },
          },
          {
            path: '/systems',
            element: (
              <RequirePermission permission="systems.view">
                <SystemsPage />
              </RequirePermission>
            ),
            handle: { titleKey: 'route.systems.title', subtitleKey: 'route.systems.subtitle' },
          },
          {
            path: '/maintenance/users',
            element: (
              <RequirePermission permission="users.view">
                <UsersListPage />
              </RequirePermission>
            ),
            handle: { titleKey: 'route.users.title', subtitleKey: 'route.users.subtitle' },
          },
          {
            path: '/maintenance/users/new',
            element: (
              <RequirePermission permission="users.create">
                <UserCreatePage />
              </RequirePermission>
            ),
            handle: { titleKey: 'route.usersNew.title', subtitleKey: 'route.usersNew.subtitle' },
          },
          {
            path: '/maintenance/users/:id/edit',
            element: (
              <RequirePermission permission="users.edit">
                <UserEditPage />
              </RequirePermission>
            ),
            handle: { titleKey: 'route.usersEdit.title', subtitleKey: 'route.usersEdit.subtitle' },
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}

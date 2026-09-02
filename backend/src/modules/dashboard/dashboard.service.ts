import { prisma } from '../../config/db';
import { getMondayDashboardSummary } from '../monday/monday.service';
import { getJiraDashboardSummary } from '../jira/jira.service';

export async function getDashboardOverview() {
  const [
    totalIssues,
    openIssues,
    inProgressIssues,
    resolvedIssues,
    closedIssues,
    criticalIssues,
    systems,
    recentIssues,
    bySystem,
    mondaySummary,
    jiraSummary,
  ] = await Promise.all([
    prisma.issue.count(),
    prisma.issue.count({ where: { status: 'open' } }),
    prisma.issue.count({ where: { status: 'in_progress' } }),
    prisma.issue.count({ where: { status: 'resolved' } }),
    prisma.issue.count({ where: { status: 'closed' } }),
    prisma.issue.count({ where: { priority: 'critical', status: { in: ['open', 'in_progress'] } } }),
    prisma.systemConnection.count({ where: { isActive: true } }),
    prisma.issue.findMany({
      take: 8,
      orderBy: { updatedAt: 'desc' },
      include: {
        system: true,
        assignedTo: true,
      },
    }),
    prisma.issue.groupBy({
      by: ['systemId'],
      _count: { issueId: true },
    }),
    getMondayDashboardSummary(),
    getJiraDashboardSummary(),
  ]);

  const systemRows = await prisma.systemConnection.findMany({
    where: { systemId: { in: bySystem.map((item) => item.systemId) } },
  });
  const systemNameById = Object.fromEntries(systemRows.map((s) => [s.systemId, s.name]));

  return {
    generated_at: new Date().toISOString(),
    totals: {
      issues: totalIssues,
      open: openIssues,
      in_progress: inProgressIssues,
      resolved: resolvedIssues,
      closed: closedIssues,
      critical_open: criticalIssues,
      systems,
    },
    monday: mondaySummary,
    jira: jiraSummary,
    by_system: bySystem.map((item) => ({
      system_id: item.systemId,
      name: systemNameById[item.systemId] ?? `System ${item.systemId}`,
      count: item._count.issueId,
    })),
    recent_issues: recentIssues.map((issue) => ({
      issue_id: issue.issueId,
      title: issue.title,
      status: issue.status,
      priority: issue.priority,
      system_name: issue.system.name,
      assigned_to: issue.assignedTo?.fullName ?? issue.assignedTo?.username ?? null,
      updated_at: issue.updatedAt,
      source: issue.externalRef?.startsWith('monday:')
        ? 'monday'
        : issue.externalRef?.startsWith('jira:')
          ? 'jira'
          : 'local',
    })),
  };
}

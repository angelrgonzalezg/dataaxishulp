const DEEPLINK_MAX = 8000;
const CURSOR_PROMPT_BASE = 'cursor://anysphere.cursor-deeplink/prompt';

const SYSTEM_HINT: Record<string, string> = {
  statia: 'Hulp system key: kadaster_statia_prod. Kadaster app: kadaster-statia-saba.',
  saba: 'Hulp system key: kadaster_saba_prod. Kadaster app: kadaster-statia-saba.',
  bonaire: 'Hulp system key: kadaster_bonaire. Confirm dialect before writes.',
  dlv: 'Hulp system key: dlv_aruba_prod. Kadaster app: Tereno (C:\\DataAxis\\tereno). Aruba VPN needed for SQL.',
};

export type CursorIssueRef = {
  source: 'monday' | 'jira' | 'local';
  title: string;
  url?: string | null;
  status?: string | null;
  assignee?: string | null;
  priority?: string | null;
  board?: string | null;
  group?: string | null;
  boardKey?: string | null;
  project?: string | null;
  issueKey?: string | null;
  daysStale?: number | null;
  extraLines?: string[];
};

function line(label: string, value?: string | number | null): string | null {
  if (value == null || String(value).trim() === '') return null;
  return `- ${label}: ${String(value).trim()}`;
}

export function buildCursorIssuePrompt(issue: CursorIssueRef, locale: 'en' | 'es'): string {
  const sourceLabel =
    issue.source === 'monday' ? 'Monday.com' : issue.source === 'jira' ? 'Jira' : 'Dataaxishulp';
  const systemHint = issue.boardKey ? SYSTEM_HINT[issue.boardKey.toLowerCase()] : null;
  const facts = [
    line(locale === 'es' ? 'Título' : 'Title', issue.title),
    line(locale === 'es' ? 'Fuente' : 'Source', sourceLabel),
    line(locale === 'es' ? 'Clave' : 'Key', issue.issueKey),
    line('Board', issue.board),
    line(locale === 'es' ? 'Grupo' : 'Group', issue.group),
    line(locale === 'es' ? 'Proyecto' : 'Project', issue.project),
    line(locale === 'es' ? 'Estado' : 'Status', issue.status),
    line(locale === 'es' ? 'Prioridad' : 'Priority', issue.priority),
    line(locale === 'es' ? 'Asignado' : 'Assignee', issue.assignee),
    line(locale === 'es' ? 'Días sin update' : 'Days without update', issue.daysStale),
    line('URL', issue.url),
    systemHint ? `- ${systemHint}` : null,
    ...(issue.extraLines ?? []).slice(0, 8).map((entry) => `- ${entry}`),
  ].filter((entry): entry is string => Boolean(entry));

  if (locale === 'es') {
    return [
      'Analiza este issue de Kadaster / DataAxis. NO apliques cambios todavía.',
      '',
      '## Issue',
      ...facts,
      '',
      '## Cómo trabajar (obligatorio)',
      '1. Diagnóstico primero: qué es, qué hay en Kador/Hulp/QuickBooks u otro sistema, y qué falta. No inventes datos.',
      '2. Propón un plan paso a paso. Quédate en inspect until I confirm; no parchees data ni escribas código hasta que yo lo pida.',
      '3. Cierra con UNA de estas opciones, explícita:',
      '   A) Se puede resolver ahora con una herramienta existente de Dataaxishulp (cuál, qué clickear, qué verificar).',
      '   B) No hay herramienta en Hulp: no forzar un arreglo a ciegas. Di si conviene incorporar la solución en Dataaxishulp para las próximas veces que este issue se presente, y cómo se vería.',
      '   C) Es de otro sistema (Kador, Tereno, QuickBooks, Power Automate, mapping). Di qué hay que cambiar allí y por qué Hulp no debe tocarlo.',
      '',
      'Workspaces: Dataaxishulp (C:\\DataAxis\\Dataaxishulp) y el Kadaster del island según el board.',
      'Cada isla tiene diferencias (schema, A-register, dialecto). No copies un arreglo de Statia a Saba, Bonaire o Aruba.',
    ].join('\n');
  }

  return [
    'Analyze this Kadaster / DataAxis issue. Do NOT apply changes yet.',
    '',
    '## Issue',
    ...facts,
    '',
    '## How to work (required)',
    '1. Diagnose first: what it is, what exists in Kador/Hulp/QuickBooks or another system, and what is missing. Do not invent data.',
    '2. Propose a step-by-step plan. Stay inspect-only until I confirm; do not patch data or write code until I ask.',
    '3. Close with ONE explicit option:',
    '   A) It can be resolved now with an existing Dataaxishulp tool (which one, what to click, what to verify).',
    '   B) Hulp has no tool: do not force a blind fix. Say whether the solution should be added to Dataaxishulp for the next time this issue appears, and how that would look.',
    '   C) It belongs to another system (Kador, Tereno, QuickBooks, Power Automate, mapping). Say what must change there and why Hulp should not touch it.',
    '',
    'Workspaces: Dataaxishulp (C:\\DataAxis\\Dataaxishulp) and the island Kadaster app for this board.',
    'Each island has differences (schema, A-register, dialect). Do not copy a Statia fix onto Saba, Bonaire, or Aruba.',
  ].join('\n');
}

export function buildCursorPromptDeeplink(issue: CursorIssueRef, locale: 'en' | 'es'): string {
  let prompt = buildCursorIssuePrompt(issue, locale);
  let href = `${CURSOR_PROMPT_BASE}?text=${encodeURIComponent(prompt)}`;
  if (href.length <= DEEPLINK_MAX) return href;

  const trimmed: CursorIssueRef = {
    ...issue,
    extraLines: [],
    title: issue.title.slice(0, 180),
  };
  prompt = buildCursorIssuePrompt(trimmed, locale);
  href = `${CURSOR_PROMPT_BASE}?text=${encodeURIComponent(prompt)}`;
  if (href.length <= DEEPLINK_MAX) return href;

  return `${CURSOR_PROMPT_BASE}?text=${encodeURIComponent(prompt.slice(0, 2500))}`;
}

export function cursorIssueFromMonday(
  item: {
    name: string;
    monday_url?: string | null;
    status?: string | null;
    assignee?: string | null;
    priority?: string | null;
    board?: string | null;
    group?: string | null;
    columns?: Array<{ column_title: string; text: string | null }>;
  },
  boardKey?: string,
  daysStale?: number | null,
): CursorIssueRef {
  const skip = new Set(['status', 'person', 'assignee', 'owner', 'prioridad', 'priority']);
  const extraLines = (item.columns ?? [])
    .filter((column) => column.text?.trim() && !skip.has(column.column_title.trim().toLowerCase()))
    .slice(0, 6)
    .map((column) => `${column.column_title}: ${column.text}`);

  return {
    source: 'monday',
    title: item.name,
    url: item.monday_url,
    status: item.status,
    assignee: item.assignee,
    priority: item.priority,
    board: item.board,
    group: item.group,
    boardKey: boardKey ?? null,
    daysStale: daysStale ?? null,
    extraLines,
  };
}

export function cursorIssueFromJira(
  item: {
    name: string;
    jira_issue_key?: string;
    jira_url?: string | null;
    status?: string | null;
    assignee?: string | null;
    priority?: string | null;
    project?: string | null;
  },
  daysStale?: number | null,
): CursorIssueRef {
  return {
    source: 'jira',
    title: item.name,
    issueKey: item.jira_issue_key,
    url: item.jira_url,
    status: item.status,
    assignee: item.assignee,
    priority: item.priority,
    project: item.project,
    daysStale: daysStale ?? null,
  };
}

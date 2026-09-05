export const MONDAY_BOARD_BAR_COLORS: Record<string, string> = {
  statia: 'bg-green-500',
  saba: 'bg-[#722F37]',
  bonaire: 'bg-orange-500',
  dlv: 'bg-blue-600',
};

export const MONDAY_BOARD_THEMES: Record<
  string,
  { card: string; header: string; accent: string; title: string; subtitle: string }
> = {
  statia: {
    card: 'border-green-200',
    header: 'border-b border-green-100 bg-green-50',
    accent: 'border-l-4 border-l-green-500',
    title: 'text-green-900',
    subtitle: 'text-green-700/80',
  },
  saba: {
    card: 'border-red-900/15',
    header: 'border-b border-red-900/10 bg-[#fdf2f3]',
    accent: 'border-l-4 border-l-[#722F37]',
    title: 'text-[#722F37]',
    subtitle: 'text-[#722F37]/75',
  },
  bonaire: {
    card: 'border-orange-200',
    header: 'border-b border-orange-100 bg-orange-50',
    accent: 'border-l-4 border-l-orange-500',
    title: 'text-orange-900',
    subtitle: 'text-orange-800/75',
  },
  dlv: {
    card: 'border-blue-200',
    header: 'border-b border-blue-100 bg-blue-50',
    accent: 'border-l-4 border-l-blue-600',
    title: 'text-blue-900',
    subtitle: 'text-blue-800/75',
  },
};

export function mondayBoardTheme(boardKey: string) {
  return (
    MONDAY_BOARD_THEMES[boardKey] ?? {
      card: 'border-ink-200',
      header: 'border-b border-ink-100 bg-ink-50/60',
      accent: 'border-l-4 border-l-brand-600',
      title: 'text-ink-900',
      subtitle: 'text-ink-500',
    }
  );
}

export function mondayBoardBarColor(boardKey: string) {
  return MONDAY_BOARD_BAR_COLORS[boardKey] ?? 'bg-brand-500';
}

/** Board name plus Monday group (Issues vs Tickets) for Limbo and filters. */
export function formatMondaySourceLabel(boardLabel: string, group?: string | null): string {
  const label = boardLabel.trim();
  const groupName = group?.trim();
  if (!groupName) return label;
  if (label.toLowerCase() === groupName.toLowerCase()) return label;
  return `${label} · ${groupName}`;
}

import { getAppVersionLabel } from '@/lib/app-version';
import { cn } from '@/lib/cn';

type AppVersionBadgeProps = {
  className?: string;
  onDark?: boolean;
};

/** Compact version label for brand headers (sidebar / login). */
export function AppVersionBadge({ className, onDark = true }: AppVersionBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide',
        onDark ? 'bg-white/10 text-white/80' : 'bg-ink-100 text-ink-600',
        className,
      )}
      title={getAppVersionLabel()}
    >
      {getAppVersionLabel()}
    </span>
  );
}

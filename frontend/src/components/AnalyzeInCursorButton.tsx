import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import {
  buildCursorPromptDeeplink,
  type CursorIssueRef,
} from '@/lib/cursorIssuePrompt';

type Variant = 'link' | 'button';

export function AnalyzeInCursorButton({
  issue,
  variant = 'button',
}: {
  issue: CursorIssueRef;
  variant?: Variant;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('es') ? 'es' : 'en';
  const href = buildCursorPromptDeeplink(issue, locale);

  function handleClick() {
    toast.success(t('issues.analyzeInCursorOpened'));
  }

  if (variant === 'link') {
    return (
      <a
        href={href}
        title={t('issues.analyzeInCursorHint')}
        onClick={handleClick}
        className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50"
      >
        <Sparkles style={{ width: 14, height: 14 }} />
        {t('issues.analyzeInCursor')}
      </a>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      title={t('issues.analyzeInCursorHint')}
      onClick={() => {
        handleClick();
        window.location.href = href;
      }}
    >
      <Sparkles style={{ width: 14, height: 14 }} />
      {t('issues.analyzeInCursor')}
    </Button>
  );
}

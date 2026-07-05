import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ProductionEnvironmentBanner({
  systemName,
}: {
  systemName: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-0 z-40 border-b-2 border-red-700 bg-red-600 px-4 py-3 text-white shadow-lg"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-extrabold uppercase tracking-wide">
            {t('support.productionBannerTitle')}
          </p>
          <p className="mt-0.5 text-sm text-red-50">
            {t('support.productionBannerBody', { system: systemName })}
          </p>
        </div>
      </div>
    </div>
  );
}

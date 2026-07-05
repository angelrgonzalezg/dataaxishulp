import { useTranslation } from 'react-i18next';
import { useLocaleStore, type Locale } from '@/store/localeStore';
import { cn } from '@/lib/cn';

const LOCALES: Locale[] = ['en', 'es'];

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const setLocale = useLocaleStore((state) => state.setLocale);
  const locale = useLocaleStore((state) => state.locale);

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => {
            setLocale(code);
            void i18n.changeLanguage(code);
          }}
          className={cn(
            'rounded-lg border px-2.5 py-1 text-xs font-bold uppercase transition-colors',
            locale === code
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50',
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { BRAND_ASSETS } from '@/config/branding';

type AppBrandVariant = 'login' | 'sidebar' | 'icon';

interface AppBrandProps {
  variant?: AppBrandVariant;
  className?: string;
  showText?: boolean;
  linkToHome?: boolean;
  onDark?: boolean;
}

export function AppBrand({
  variant = 'sidebar',
  className,
  showText = true,
  linkToHome = false,
  onDark = false,
}: AppBrandProps) {
  const { t } = useTranslation();

  const logoSrc =
    variant === 'icon'
      ? BRAND_ASSETS.logoIcon
      : variant === 'login'
        ? BRAND_ASSETS.logoLogin
        : BRAND_ASSETS.logoWide;

  const logoHeight =
    variant === 'icon' ? 'h-10 w-10' : variant === 'login' ? 'h-12' : 'h-10';

  const content = (
    <div className={cn('flex items-center gap-3', className)}>
      <img
        src={logoSrc}
        alt={t('common.companyName')}
        className={cn('object-contain object-left', logoHeight, variant !== 'icon' && 'w-auto max-w-[180px]')}
      />
      {showText && (
        <div className="min-w-0">
          <p className={cn('text-sm font-bold leading-tight', onDark ? 'text-white' : 'text-ink-900')}>
            {t('common.appName')}
          </p>
          <p className={cn('text-xs', onDark ? 'text-white/70' : 'text-ink-400')}>
            {t('common.appTagline')}
          </p>
        </div>
      )}
    </div>
  );

  if (linkToHome) {
    return (
      <Link to="/" className="block rounded-xl outline-none ring-brand-500 focus-visible:ring-2">
        {content}
      </Link>
    );
  }

  return content;
}

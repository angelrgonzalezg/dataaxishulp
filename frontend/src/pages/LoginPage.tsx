import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Lock, ShieldCheck, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AppBrand } from '@/components/branding/AppBrand';
import { AppVersionBadge } from '@/components/branding/AppVersionBadge';
import { useAuth } from '@/hooks/useAuth';
import { extractErrorMessage } from '@/api/client';

function createLoginSchema(t: TFunction) {
  return z.object({
    username: z.string().min(1, t('validation.usernameRequired')),
    password: z.string().min(1, t('validation.passwordRequired')),
  });
}

type LoginForm = z.infer<ReturnType<typeof createLoginSchema>>;

interface LocationState {
  from?: { pathname?: string };
}

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);

  const loginSchema = useMemo(() => createLoginSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  async function onSubmit(values: LoginForm) {
    setSubmitting(true);
    try {
      await login(values.username, values.password);
      const target = (location.state as LocationState | null)?.from?.pathname ?? '/';
      toast.success(t('auth.welcomeToast'));
      navigate(target, { replace: true });
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid h-full lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-600 lg:block">
        <motion.div
          className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-2xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-3xl"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <AppBrand variant="login" showText={false} onDark />

          <div className="max-w-md">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="text-4xl font-extrabold leading-tight"
            >
              {t('auth.heroTitle')}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5 }}
              className="mt-4 text-white/80"
            >
              {t('auth.heroSubtitle')}
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              className="mt-6 text-lg font-semibold text-white/90"
            >
              <span className="inline-flex items-center gap-2">
                {t('common.appName')}
                <AppVersionBadge />
              </span>
              <span className="mx-2 font-normal text-white/50">·</span>
              {t('common.companyName')}
            </motion.p>
          </div>

          <div className="flex items-center gap-2 text-sm text-white/70">
            <ShieldCheck style={{ width: 18, height: 18 }} />
            {t('auth.jwtProtected')}
          </div>
        </div>
      </div>

      <div className="relative flex items-center justify-center bg-brand-600 p-6 lg:bg-ink-50">
        <LanguageSwitcher className="absolute right-6 top-6 [&_button]:border-white/20 [&_button]:bg-white/10 [&_button]:text-white lg:[&_button]:border-ink-200 lg:[&_button]:bg-white lg:[&_button]:text-ink-700" />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex justify-center lg:justify-start">
            <AppBrand variant="login" showText={false} className="lg:hidden" onDark />
            <div className="hidden lg:block">
              <AppBrand variant="sidebar" showText linkToHome={false} />
            </div>
          </div>

          <h1 className="text-center text-2xl font-extrabold text-white lg:text-left lg:text-ink-900">
            {t('auth.loginTitle')}
          </h1>
          <p className="mt-1 text-center text-sm text-white/75 lg:text-left lg:text-ink-500">
            {t('auth.loginSubtitle')}
          </p>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mt-8 flex flex-col gap-5 [&_label]:text-white lg:[&_label]:text-ink-700"
          >
            <Field
              label={t('auth.username')}
              htmlFor="username"
              required
              error={errors.username?.message}
            >
              <Input
                id="username"
                autoComplete="username"
                placeholder="admin"
                icon={<User style={{ width: 18, height: 18 }} />}
                invalid={Boolean(errors.username)}
                {...register('username')}
              />
            </Field>

            <Field
              label={t('auth.password')}
              htmlFor="password"
              required
              error={errors.password?.message}
            >
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                icon={<Lock style={{ width: 18, height: 18 }} />}
                invalid={Boolean(errors.password)}
                {...register('password')}
              />
            </Field>

            <Button type="submit" size="lg" loading={submitting} className="mt-2 w-full">
              {t('auth.submit')}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-white/60 lg:text-ink-400">
            {t('common.companyName')} · {t('common.appRegion')}
          </p>
        </motion.div>
      </div>
    </div>
  );
}

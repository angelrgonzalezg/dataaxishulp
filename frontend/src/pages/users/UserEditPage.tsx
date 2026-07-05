import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { fetchUser, updateUser } from '@/api/users.api';
import { extractErrorMessage } from '@/api/client';
import type { UserRole } from '@/types';

interface FormValues {
  email: string;
  full_name: string;
  role: UserRole;
  is_active: string;
  password: string;
}

export function UserEditPage() {
  const { id } = useParams();
  const userId = Number(id);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['users', userId],
    queryFn: () => fetchUser(userId),
    enabled: Number.isFinite(userId),
  });
  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateUser>[1]) => updateUser(userId, payload),
  });

  const { register, handleSubmit, reset } = useForm<FormValues>();

  useEffect(() => {
    if (user) {
      reset({
        email: user.email,
        full_name: user.full_name ?? '',
        role: user.role,
        is_active: user.is_active ? 'true' : 'false',
        password: '',
      });
    }
  }, [user, reset]);

  async function onSubmit(values: FormValues) {
    try {
      await mutation.mutateAsync({
        email: values.email,
        full_name: values.full_name || null,
        role: values.role,
        is_active: values.is_active === 'true',
        ...(values.password ? { password: values.password } : {}),
      });
      toast.success(t('users.updateSuccess'));
      navigate('/maintenance/users');
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  }

  if (isLoading) return <Card className="p-8 text-sm text-ink-500">{t('common.loading')}</Card>;
  if (isError || !user) return <Card className="p-8 text-sm text-red-600">{t('users.loadError')}</Card>;

  return (
    <div className="mx-auto max-w-xl">
      <Card className="p-6">
        <p className="mb-4 text-sm text-ink-500">@{user.username}</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Field label={t('users.email')} required>
            <Input type="email" {...register('email', { required: true })} />
          </Field>
          <Field label={t('users.fullName')}>
            <Input {...register('full_name')} />
          </Field>
          <Field label={t('users.role')} required>
            <Select {...register('role')}>
              {(['admin', 'agent', 'viewer'] as UserRole[]).map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('users.allStatuses')}>
            <Select {...register('is_active')}>
              <option value="true">{t('users.active')}</option>
              <option value="false">{t('users.inactive')}</option>
            </Select>
          </Field>
          <Field label={t('users.passwordOptional')}>
            <Input type="password" {...register('password')} />
          </Field>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => navigate('/maintenance/users')}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

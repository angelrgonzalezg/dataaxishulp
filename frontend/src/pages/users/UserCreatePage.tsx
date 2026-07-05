import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { createUser } from '@/api/users.api';
import { extractErrorMessage } from '@/api/client';
import type { UserRole } from '@/types';

interface FormValues {
  username: string;
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}

export function UserCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mutation = useMutation({ mutationFn: createUser });

  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      username: '',
      email: '',
      password: '',
      full_name: '',
      role: 'agent',
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      await mutation.mutateAsync({
        ...values,
        full_name: values.full_name || undefined,
      });
      toast.success(t('users.createSuccess'));
      navigate('/maintenance/users');
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <Card className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Field label={t('users.username')} required>
            <Input {...register('username', { required: true, minLength: 3 })} />
          </Field>
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
          <Field label={t('users.password')} required>
            <Input type="password" {...register('password', { required: true, minLength: 6 })} />
          </Field>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => navigate('/maintenance/users')}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

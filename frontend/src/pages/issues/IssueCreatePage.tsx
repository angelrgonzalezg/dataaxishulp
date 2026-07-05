import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { extractErrorMessage } from '@/api/client';
import { useIssueMutations } from '@/hooks/useIssues';
import { useSystems } from '@/hooks/useSystems';
import type { IssuePriority } from '@/types';

interface FormValues {
  title: string;
  description: string;
  system_id: string;
  priority: IssuePriority;
  category: string;
  external_ref: string;
}

export function IssueCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: systems } = useSystems();
  const { create } = useIssueMutations();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      title: '',
      description: '',
      system_id: '',
      priority: 'medium',
      category: '',
      external_ref: '',
    },
  });

  async function onSubmit(values: FormValues) {
    try {
      const issue = await create.mutateAsync({
        title: values.title,
        description: values.description,
        system_id: Number(values.system_id),
        priority: values.priority,
        category: values.category || undefined,
        external_ref: values.external_ref || undefined,
      });
      toast.success(t('issues.createSuccess'));
      navigate(`/issues/${issue.issue_id}`);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Field label={t('issues.titleLabel')} required error={errors.title?.message}>
            <Input {...register('title', { required: true, minLength: 3 })} />
          </Field>
          <Field label={t('issues.descriptionLabel')} required error={errors.description?.message}>
            <Textarea {...register('description', { required: true })} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('issues.systemLabel')} required>
              <Select {...register('system_id', { required: true })}>
                <option value="">{t('issues.allSystems')}</option>
                {(systems ?? [])
                  .filter((system) => system.is_active)
                  .map((system) => (
                    <option key={system.system_id} value={system.system_id}>
                      {system.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label={t('issues.priorityLabel')}>
              <Select {...register('priority')}>
                {(['low', 'medium', 'high', 'critical'] as IssuePriority[]).map((value) => (
                  <option key={value} value={value}>
                    {t(`issues.priorities.${value}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('issues.categoryLabel')}>
              <Input {...register('category')} />
            </Field>
            <Field label={t('issues.externalRefLabel')}>
              <Input {...register('external_ref')} />
            </Field>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => navigate('/issues')}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

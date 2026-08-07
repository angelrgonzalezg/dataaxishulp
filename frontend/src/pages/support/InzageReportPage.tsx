import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { ArrowLeft, Download, FileText, Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { ProductionEnvironmentBanner } from '@/components/support/ProductionEnvironmentBanner';
import { InzageObjectView, InzageSubjectView } from '@/components/inzage/InzageDocument';
import { InzagePdfDocument, inzageFileName } from '@/components/inzage/InzagePdf';
import { useObjectInzage, useSubjectInzage } from '@/hooks/useInzage';
import { extractErrorMessage } from '@/api/client';
import type { InzageObjectVariant, InzageSubjectVariant } from '@/types';

const OBJECT_VARIANTS: InzageObjectVariant[] = ['object', 'object_beperkt', 'her', 'na'];

export function InzageReportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const systemKey = params.get('systemKey') ?? 'kadaster_statia';
  const parcelId = params.get('parcelId') ? Number(params.get('parcelId')) : null;
  const subjectId = params.get('subjectId') ? Number(params.get('subjectId')) : null;
  const objectVariant = (params.get('variant') as InzageObjectVariant) ?? 'object';
  const subjectVariant = (params.get('subjectVariant') as InzageSubjectVariant) ?? 'subject';
  const returnEntry = params.get('returnEntry');
  const returnValue = params.get('returnValue');

  const isSubject = subjectId != null && subjectId > 0;

  const objectQuery = useObjectInzage(isSubject ? null : parcelId, systemKey, objectVariant);
  const subjectQuery = useSubjectInzage(isSubject ? subjectId : null, systemKey, subjectVariant);

  const activeQuery = isSubject ? subjectQuery : objectQuery;
  const report = activeQuery.data;

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params);
      if (value == null) next.delete(key);
      else next.set(key, value);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const openSubject = useCallback(
    (id: number) => {
      const next = new URLSearchParams(params);
      next.set('subjectId', String(id));
      next.set('subjectVariant', 'subject');
      setParams(next, { replace: false });
    },
    [params, setParams],
  );

  function goBack() {
    if (isSubject) {
      const next = new URLSearchParams(params);
      next.delete('subjectId');
      next.delete('subjectVariant');
      setParams(next, { replace: true });
      return;
    }

    if (
      returnEntry &&
      returnValue &&
      (returnEntry === 'parcel_number' ||
        returnEntry === 'meet_brief' ||
        returnEntry === 'order' ||
        returnEntry === 'kenmerk' ||
        returnEntry === 'register_deed' ||
        returnEntry === 'deed_history')
    ) {
      const next = new URLSearchParams({
        entry: returnEntry,
        q: returnValue,
        systemKey,
        autoload: '1',
      });
      navigate(`/support?${next.toString()}`);
      return;
    }

    if (parcelId != null && parcelId > 0) {
      const next = new URLSearchParams({
        entry: 'parcel_number',
        q: String(parcelId),
        systemKey,
        autoload: '1',
      });
      navigate(`/support?${next.toString()}`);
      return;
    }

    navigate('/support');
  }

  const isProduction = report?.is_production ?? false;

  return (
    <div className="-mx-8 -mt-8">
      {isProduction && report && <ProductionEnvironmentBanner systemName={report.system_name} />}

      <div className="mx-auto max-w-4xl space-y-6 px-8 py-8">
        <Card className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between print:hidden">
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={goBack}>
              <ArrowLeft style={{ width: 16, height: 16 }} />
              {t('inzage.back')}
            </Button>
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-700">
              <FileText style={{ width: 18, height: 18 }} />
              {t('inzage.title')}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isSubject ? (
              <Select
                value={subjectVariant}
                onChange={(event) => updateParam('subjectVariant', event.target.value)}
                className="w-56"
              >
                <option value="subject">{t('inzage.variant.subject')}</option>
                <option value="negatief">{t('inzage.variant.negatief')}</option>
              </Select>
            ) : (
              <Select
                value={objectVariant}
                onChange={(event) => updateParam('variant', event.target.value)}
                className="w-56"
              >
                {OBJECT_VARIANTS.map((variant) => (
                  <option key={variant} value={variant}>
                    {t(`inzage.variant.${variant}`)}
                  </option>
                ))}
              </Select>
            )}

            <Button variant="secondary" size="sm" onClick={() => window.print()} disabled={!report}>
              <Printer style={{ width: 16, height: 16 }} />
              {t('inzage.print')}
            </Button>

            {report && (
              <PDFDownloadLink
                document={<InzagePdfDocument report={report} />}
                fileName={inzageFileName(report)}
              >
                <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700">
                  <Download style={{ width: 16, height: 16 }} />
                  {t('inzage.downloadPdf')}
                </span>
              </PDFDownloadLink>
            )}
          </div>
        </Card>

        {activeQuery.isError && (
          <Card className="p-6 text-sm text-red-600 print:hidden">
            {extractErrorMessage(activeQuery.error)}
          </Card>
        )}

        {activeQuery.isFetching && !report && (
          <Card className="p-8 text-center text-sm text-ink-500 print:hidden">
            {t('common.loading')}
          </Card>
        )}

        {report && (
          <div className="inzage-print-root">
            {report.kind === 'object' ? (
              <InzageObjectView report={report} onOpenSubject={openSubject} />
            ) : (
              <InzageSubjectView report={report} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

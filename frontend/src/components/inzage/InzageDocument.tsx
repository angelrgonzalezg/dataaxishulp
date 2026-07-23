import type {
  InzageDeedRef,
  InzageEntry,
  InzageObjectReport,
  InzageSubjectReport,
} from '@/types';

function deedLine(deed: InzageDeedRef): string | null {
  if (!deed.register && deed.segment == null && deed.number == null) return null;
  return `Ingeschreven in Register: ${deed.register ?? '—'} deel: ${
    deed.segment ?? '—'
  } nummer: ${deed.number ?? '—'}`;
}

function EntryView({ entry }: { entry: InzageEntry }) {
  return (
    <div className="border-l-2 border-brand-100 pl-4">
      {entry.typeDescription && (
        <p className="font-semibold text-ink-900">{entry.typeDescription}</p>
      )}

      {entry.parties.map((party, index) => (
        <p key={index} className="text-ink-800">
          {party.role ? `${party.role}: ` : ''}
          <span className="font-medium">{party.name}</span>
          {party.share ? ` (${party.share})` : ''}
        </p>
      ))}

      {entry.note && <p className="italic text-ink-700">{entry.note}</p>}

      {entry.amount && (
        <p className="text-ink-800">
          <span className="text-ink-500">In hoofdsom groot: </span>
          {entry.amount}
        </p>
      )}

      {entry.legalFact && (
        <p className="text-ink-800">
          <span className="text-ink-500">{entry.obtainedLabel ?? 'Verkregen bij'}: </span>
          {entry.legalFact}
        </p>
      )}

      {entry.deedDate && (
        <p className="text-ink-800">
          <span className="text-ink-500">Verleden op: </span>
          {entry.deedDate}
        </p>
      )}

      {entry.notary && (
        <p className="text-ink-800">
          <span className="text-ink-500">Voor notaris: </span>
          {entry.notary}
        </p>
      )}

      {entry.submissionDate && (
        <p className="text-ink-800">
          <span className="text-ink-500">Registratiedatum: </span>
          {entry.submissionDate}
        </p>
      )}

      {deedLine(entry.deed) && <p className="text-ink-700">{deedLine(entry.deed)}</p>}

      {entry.sourceDeeds.map((source, index) => {
        const line = deedLine(source);
        return line ? (
          <p key={index} className="text-ink-600">
            Is aanvulling op: {line.replace('Ingeschreven in ', '')}
          </p>
        ) : null;
      })}

      {entry.extraLines.map((line, index) => (
        <p key={index} className="text-ink-700">
          {line}
        </p>
      ))}
    </div>
  );
}

function HeaderField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="w-40 shrink-0 text-ink-500">{label}</span>
      <span className="font-medium text-ink-900">{value}</span>
    </div>
  );
}

export function InzageObjectView({
  report,
  onOpenSubject,
}: {
  report: InzageObjectReport;
  onOpenSubject?: (subjectId: number) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-ink-200 bg-white p-10 text-sm leading-relaxed shadow-soft print:border-0 print:shadow-none">
      <div className="text-center">
        <h1 className="text-lg font-extrabold uppercase tracking-wide text-ink-900">
          {report.title}
        </h1>
        <p className="mt-1 text-xs text-ink-500">
          Inzage datum en tijd: {report.generated_at} · {report.system_name}
        </p>
      </div>

      <section className="space-y-1 rounded-xl bg-ink-50 p-4">
        <HeaderField label="Kadastrale aanduiding" value={report.header.esri} />
        <HeaderField label="Perceelnummer" value={String(report.header.parcel_id)} />
        <HeaderField label="Grootte" value={report.header.size} />
        <HeaderField label="Omschrijving" value={report.header.description} />
        <HeaderField label="Locatie" value={report.header.location} />
        <HeaderField label="Bladnummer" value={report.header.sheet} />
        <HeaderField label="Diamant Letter" value={report.header.diamond_letter} />
      </section>

      {report.sections.map((section) => (
        <section key={section.key} className="space-y-3">
          <h2 className="border-b border-ink-200 pb-1 font-bold uppercase tracking-wide text-brand-800">
            {section.heading}
          </h2>
          {section.entries.length === 0 ? (
            <p className="text-ink-600">{section.emptyText ?? '—'}</p>
          ) : (
            <div className="space-y-4">
              {section.entries.map((entry, index) => (
                <EntryView key={index} entry={entry} />
              ))}
            </div>
          )}
        </section>
      ))}

      {report.linked_subjects.length > 0 && (
        <section className="space-y-2 print:hidden">
          <h2 className="border-b border-ink-200 pb-1 font-bold uppercase tracking-wide text-brand-800">
            Gerechtigden — open subject inzage
          </h2>
          <div className="flex flex-wrap gap-2">
            {report.linked_subjects.map((subject) => (
              <button
                key={subject.subject_id}
                type="button"
                onClick={() => onOpenSubject?.(subject.subject_id)}
                className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
              >
                {subject.name} →
              </button>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-ink-200 pt-4 text-center text-xs text-ink-500">
        De Gemandateerde Bewaarder · {report.generated_at}
      </footer>
    </div>
  );
}

export function InzageSubjectView({ report }: { report: InzageSubjectReport }) {
  const person = report.person;
  return (
    <div className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-ink-200 bg-white p-10 text-sm leading-relaxed shadow-soft print:border-0 print:shadow-none">
      <div className="text-center">
        <h1 className="text-lg font-extrabold uppercase tracking-wide text-ink-900">
          {report.title}
        </h1>
        <p className="mt-1 text-xs text-ink-500">
          Inzage datum en tijd: {report.generated_at} · {report.system_name}
        </p>
      </div>

      <section className="space-y-1 rounded-xl bg-ink-50 p-4">
        <h2 className="mb-2 font-bold text-brand-800">
          {person.is_natural_person ? 'Persoon' : 'Rechtspersoon'}
        </h2>
        <HeaderField label="Naam" value={person.name} />
        {person.is_natural_person ? (
          <>
            <HeaderField label="Geslacht" value={person.gender} />
            <HeaderField label="Beroep" value={person.occupation} />
            <HeaderField label="Geboortedatum" value={person.date_of_birth} />
            <HeaderField label="GeboorteLand" value={person.place_of_birth} />
          </>
        ) : (
          <HeaderField label="Aard" value={person.organizational_structure} />
        )}
        <HeaderField
          label={person.is_natural_person ? 'Woonadress' : 'Adres'}
          value={person.address}
        />
      </section>

      {report.declaration ? (
        <section className="space-y-2">
          <h2 className="border-b border-ink-200 pb-1 font-bold uppercase tracking-wide text-brand-800">
            Verklaring
          </h2>
          <p className="text-ink-800">{report.declaration}</p>
        </section>
      ) : report.rights.length === 0 ? (
        <p className="text-ink-600">Geen zakelijke rechten geregistreerd.</p>
      ) : (
        report.rights.map((right) => (
          <section key={right.index} className="space-y-1">
            <h2 className="border-b border-ink-200 pb-1 font-bold uppercase tracking-wide text-brand-800">
              Kadastrale aanduiding object {right.index}
            </h2>
            <HeaderField label="Kadastrale aanduiding" value={right.esri} />
            <HeaderField label="Grootte" value={right.size ? `${right.size} m²` : null} />
            <HeaderField label="Omschrijving" value={right.description} />
            <HeaderField label="Locatie" value={right.location} />
            <HeaderField label="Bladnummer" value={right.sheet} />
            <HeaderField label="Diamant Letter" value={right.diamond_letter} />
            <div className="mt-2 space-y-1">
              <HeaderField label="Aandeel in recht" value={right.share} />
              <HeaderField label="Recht verkregen bij" value={right.obtained_at} />
              <HeaderField label="Type akte" value={right.akte} />
              <HeaderField label="Koopprijs" value={right.price} />
              <HeaderField label="Ingeschreven op" value={right.submission_date} />
              <HeaderField label="Verleden op" value={right.deed_date} />
              <HeaderField label="Voor notaris" value={right.notary} />
            </div>
          </section>
        ))
      )}

      <footer className="border-t border-ink-200 pt-4 text-center text-xs text-ink-500">
        De Gemandateerde Bewaarder · {report.generated_at}
      </footer>
    </div>
  );
}

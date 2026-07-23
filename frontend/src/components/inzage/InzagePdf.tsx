import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { InzageDeedRef, InzageObjectReport, InzageSubjectReport } from '@/types';

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 48,
    fontSize: 10,
    lineHeight: 1.5,
    color: '#1f2937',
    fontFamily: 'Helvetica',
  },
  title: { fontSize: 14, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  meta: { fontSize: 8, textAlign: 'center', color: '#6b7280', marginBottom: 14 },
  metaBox: { backgroundColor: '#f3f4f6', padding: 10, borderRadius: 4, marginBottom: 14 },
  fieldRow: { flexDirection: 'row', marginBottom: 1 },
  fieldLabel: { width: 130, color: '#6b7280' },
  fieldValue: { flex: 1, fontFamily: 'Helvetica-Bold' },
  sectionHeading: {
    fontFamily: 'Helvetica-Bold',
    color: '#1e3a8a',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    paddingBottom: 2,
    marginTop: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  entry: {
    borderLeftWidth: 2,
    borderLeftColor: '#dbeafe',
    paddingLeft: 8,
    marginBottom: 8,
  },
  bold: { fontFamily: 'Helvetica-Bold' },
  muted: { color: '#6b7280' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    textAlign: 'center',
    fontSize: 8,
    color: '#6b7280',
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    paddingTop: 6,
  },
});

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function deedLine(deed: InzageDeedRef): string | null {
  if (!deed.register && deed.segment == null && deed.number == null) return null;
  return `Ingeschreven in Register: ${deed.register ?? '—'} deel: ${
    deed.segment ?? '—'
  } nummer: ${deed.number ?? '—'}`;
}

function ObjectDoc({ report }: { report: InzageObjectReport }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>{report.title}</Text>
      <Text style={styles.meta}>
        Inzage datum en tijd: {report.generated_at} · {report.system_name}
      </Text>

      <View style={styles.metaBox}>
        <Field label="Kadastrale aanduiding" value={report.header.esri} />
        <Field label="Perceelnummer" value={String(report.header.parcel_id)} />
        <Field label="Grootte" value={report.header.size} />
        <Field label="Omschrijving" value={report.header.description} />
        <Field label="Locatie" value={report.header.location} />
        <Field label="Bladnummer" value={report.header.sheet} />
        <Field label="Diamant Letter" value={report.header.diamond_letter} />
      </View>

      {report.sections.map((section) => (
        <View key={section.key} wrap={false}>
          <Text style={styles.sectionHeading}>{section.heading}</Text>
          {section.entries.length === 0 ? (
            <Text>{section.emptyText ?? '—'}</Text>
          ) : (
            section.entries.map((entry, index) => (
              <View key={index} style={styles.entry}>
                {entry.typeDescription ? <Text style={styles.bold}>{entry.typeDescription}</Text> : null}
                {entry.parties.map((party, partyIndex) => (
                  <Text key={partyIndex}>
                    {party.role ? `${party.role}: ` : ''}
                    <Text style={styles.bold}>{party.name}</Text>
                    {party.share ? ` (${party.share})` : ''}
                  </Text>
                ))}
                {entry.note ? <Text>{entry.note}</Text> : null}
                {entry.amount ? (
                  <Text>
                    <Text style={styles.muted}>In hoofdsom groot: </Text>
                    {entry.amount}
                  </Text>
                ) : null}
                {entry.legalFact ? (
                  <Text>
                    <Text style={styles.muted}>{entry.obtainedLabel ?? 'Verkregen bij'}: </Text>
                    {entry.legalFact}
                  </Text>
                ) : null}
                {entry.deedDate ? (
                  <Text>
                    <Text style={styles.muted}>Verleden op: </Text>
                    {entry.deedDate}
                  </Text>
                ) : null}
                {entry.notary ? (
                  <Text>
                    <Text style={styles.muted}>Voor notaris: </Text>
                    {entry.notary}
                  </Text>
                ) : null}
                {entry.submissionDate ? (
                  <Text>
                    <Text style={styles.muted}>Registratiedatum: </Text>
                    {entry.submissionDate}
                  </Text>
                ) : null}
                {deedLine(entry.deed) ? <Text>{deedLine(entry.deed)}</Text> : null}
                {entry.sourceDeeds.map((source, sourceIndex) => {
                  const line = deedLine(source);
                  return line ? (
                    <Text key={sourceIndex} style={styles.muted}>
                      Is aanvulling op: {line.replace('Ingeschreven in ', '')}
                    </Text>
                  ) : null;
                })}
                {entry.extraLines.map((line, lineIndex) => (
                  <Text key={lineIndex}>{line}</Text>
                ))}
              </View>
            ))
          )}
        </View>
      ))}

      <Text style={styles.footer} fixed>
        De Gemandateerde Bewaarder · {report.generated_at}
      </Text>
    </Page>
  );
}

function SubjectDoc({ report }: { report: InzageSubjectReport }) {
  const person = report.person;
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>{report.title}</Text>
      <Text style={styles.meta}>
        Inzage datum en tijd: {report.generated_at} · {report.system_name}
      </Text>

      <View style={styles.metaBox}>
        <Text style={[styles.bold, { marginBottom: 4, color: '#1e3a8a' }]}>
          {person.is_natural_person ? 'Persoon' : 'Rechtspersoon'}
        </Text>
        <Field label="Naam" value={person.name} />
        {person.is_natural_person ? (
          <>
            <Field label="Geslacht" value={person.gender} />
            <Field label="Beroep" value={person.occupation} />
            <Field label="Geboortedatum" value={person.date_of_birth} />
            <Field label="GeboorteLand" value={person.place_of_birth} />
          </>
        ) : (
          <Field label="Aard" value={person.organizational_structure} />
        )}
        <Field
          label={person.is_natural_person ? 'Woonadress' : 'Adres'}
          value={person.address}
        />
      </View>

      {report.declaration ? (
        <View>
          <Text style={styles.sectionHeading}>Verklaring</Text>
          <Text>{report.declaration}</Text>
        </View>
      ) : (
        report.rights.map((right) => (
          <View key={right.index} wrap={false}>
            <Text style={styles.sectionHeading}>Kadastrale aanduiding object {right.index}</Text>
            <Field label="Kadastrale aanduiding" value={right.esri} />
            <Field label="Grootte" value={right.size ? `${right.size} m²` : null} />
            <Field label="Omschrijving" value={right.description} />
            <Field label="Locatie" value={right.location} />
            <Field label="Bladnummer" value={right.sheet} />
            <Field label="Diamant Letter" value={right.diamond_letter} />
            <Field label="Aandeel in recht" value={right.share} />
            <Field label="Recht verkregen bij" value={right.obtained_at} />
            <Field label="Type akte" value={right.akte} />
            <Field label="Koopprijs" value={right.price} />
            <Field label="Ingeschreven op" value={right.submission_date} />
            <Field label="Verleden op" value={right.deed_date} />
            <Field label="Voor notaris" value={right.notary} />
          </View>
        ))
      )}

      <Text style={styles.footer} fixed>
        De Gemandateerde Bewaarder · {report.generated_at}
      </Text>
    </Page>
  );
}

export function InzagePdfDocument({
  report,
}: {
  report: InzageObjectReport | InzageSubjectReport;
}) {
  return (
    <Document title={report.title}>
      {report.kind === 'object' ? <ObjectDoc report={report} /> : <SubjectDoc report={report} />}
    </Document>
  );
}

export function inzageFileName(report: InzageObjectReport | InzageSubjectReport): string {
  if (report.kind === 'object') {
    return `Inzage-${report.header.esri ?? report.header.parcel_id}.pdf`;
  }
  return `Inzage-subject-${report.person.subject_id}.pdf`;
}

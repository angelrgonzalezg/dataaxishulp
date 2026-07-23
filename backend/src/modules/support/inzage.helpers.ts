import { getField, getFieldNumber, getFieldString } from './support.frames';
import type { InzageDeedRef, InzageParty } from './inzage.types';

/** dd-MM-yyyy from a Date or ISO/string date, using UTC parts to avoid TZ shifts. */
export function formatDate(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

/** dd-MM-yyyy HH:mm for the "generated at" line. */
export function formatDateTime(value: Date): string {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const year = value.getFullYear();
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

const SYMBOL_TO_CURRENCY: Record<string, string> = {
  'US$': 'USD',
  $: 'USD',
  '€': 'EUR',
  'Naƒ': 'NAF',
  AWG: 'AWG',
  ƒ: 'ANG',
};

/** e.g. formatPrice(120000, "US$") -> "US$ 120.000,00" */
export function formatPrice(amount: unknown, symbol?: string | null): string | null {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  const sym = (symbol ?? '').trim();
  const currency = SYMBOL_TO_CURRENCY[sym] ?? 'USD';
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    formatted = new Intl.NumberFormat('nl-NL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    return `${sym || currency} ${formatted}`.trim();
  }
  return formatted;
}

export function buildSubjectName(row: Record<string, unknown>): string {
  const first = getFieldString(row, 'firstName', 'SubjectNaamVoor') ?? '';
  const middle = getFieldString(row, 'middleName', 'SubjectNaamTussen') ?? '';
  const last = getFieldString(row, 'lastName', 'SubjectNaam') ?? '';
  const name = [first, middle, last].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return name.length > 0 ? name : '—';
}

export function deedRef(row: Record<string, unknown>): InzageDeedRef {
  return {
    register: getFieldString(row, 'legalFactRegister', 'register', 'deedLetter'),
    segment: getFieldNumber(row, 'segment', 'Segment', 'part'),
    number: getFieldNumber(row, 'number', 'Number'),
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

interface Fraction {
  num: number;
  den: number;
}

export function simplifyFraction(num: number, den: number): Fraction {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    return { num: 0, den: 1 };
  }
  const divisor = gcd(num, den) || 1;
  return { num: num / divisor, den: den / divisor };
}

export function addFractions(a: Fraction, b: Fraction): Fraction {
  const num = a.num * b.den + b.num * a.den;
  const den = a.den * b.den;
  return simplifyFraction(num, den);
}

export function formatFraction(fraction: Fraction | null): string | null {
  if (!fraction || fraction.num === 0) return null;
  return `${fraction.num}/${fraction.den}`;
}

/**
 * Groups deed-detail rows by subject, summing shares. Each row is expected to
 * carry SubjectId + share numerator/denominator + name fields.
 */
export function groupParties(
  rows: Record<string, unknown>[],
  role: string | null = null,
): InzageParty[] {
  const bySubject = new Map<number, { name: string; fraction: Fraction | null }>();

  for (const row of rows) {
    const subjectId = getFieldNumber(row, 'SubjectId', 'subjectId', 'SubjectID');
    if (subjectId == null) continue;
    const name = buildSubjectName(row);
    const num = getFieldNumber(row, 'shareNum', 'ShareNumerator', 'shareNumerator');
    const den = getFieldNumber(row, 'shareDen', 'ShareDenominator', 'shareDenominator');
    const share = num != null && den != null && den !== 0 ? simplifyFraction(num, den) : null;

    const existing = bySubject.get(subjectId);
    if (existing) {
      if (share) {
        existing.fraction = existing.fraction ? addFractions(existing.fraction, share) : share;
      }
    } else {
      bySubject.set(subjectId, { name, fraction: share });
    }
  }

  return [...bySubject.values()].map((entry) => ({
    name: entry.name,
    share: formatFraction(entry.fraction),
    role,
  }));
}

export function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value ?? '').trim().toLowerCase();
  return text === '1' || text === 'true';
}

export { getField, getFieldNumber, getFieldString };

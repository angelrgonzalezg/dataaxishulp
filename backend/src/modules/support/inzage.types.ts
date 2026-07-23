export type InzageObjectVariant = 'object' | 'object_beperkt' | 'her' | 'na';
export type InzageSubjectVariant = 'subject' | 'negatief';

/** Reference to a deed as printed on the extract: "Register: C deel: 156 nummer: 3". */
export interface InzageDeedRef {
  register: string | null;
  segment: number | null;
  number: number | null;
}

export interface InzageParty {
  name: string;
  /** Simplified/summed share, e.g. "1/2". */
  share: string | null;
  /** Optional role label, e.g. "Belanghebbende", "Lijder". */
  role: string | null;
}

export interface InzageEntry {
  parties: InzageParty[];
  /** Akte / legal fact name (nl). */
  legalFact: string | null;
  /** Label used before the legal fact, e.g. "Verkregen bij", "Gevestigd bij". */
  obtainedLabel: string | null;
  /** Bold type description, e.g. "Recht van hypotheek", "Recht van Vruchtgebruik". */
  typeDescription: string | null;
  deedDate: string | null;
  submissionDate: string | null;
  notary: string | null;
  note: string | null;
  /** Formatted monetary amount, e.g. "US$ 120.000,00". */
  amount: string | null;
  deed: InzageDeedRef;
  /** Extra free-form lines for less common sections (mandeligheid, splitsing). */
  extraLines: string[];
  /** "Is aanvulling op" references for mortgage amendments. */
  sourceDeeds: InzageDeedRef[];
}

export interface InzageSection {
  key: string;
  heading: string;
  /** Rendered when there are no entries (e.g. "Vrij van hypotheek"); null hides the section. */
  emptyText: string | null;
  entries: InzageEntry[];
}

export interface InzageObjectHeader {
  parcel_id: number;
  esri: string | null;
  description: string | null;
  size: string | null;
  sheet: string | null;
  diamond_letter: string | null;
  location: string | null;
  status: string | null;
  particulars: string | null;
  split_flag: boolean;
  is_reviewed: boolean;
}

export interface InzageObjectReport {
  kind: 'object';
  variant: InzageObjectVariant;
  system_key: string;
  system_name: string;
  is_production: boolean;
  title: string;
  generated_at: string;
  header: InzageObjectHeader;
  sections: InzageSection[];
  /** Subjects found on the parcel, for drilling into a subject inzage. */
  linked_subjects: Array<{ subject_id: number; name: string }>;
}

export interface InzageSubjectRight {
  index: number;
  parcel_id: number | null;
  esri: string | null;
  size: string | null;
  description: string | null;
  location: string | null;
  sheet: string | null;
  diamond_letter: string | null;
  share: string | null;
  legal_fact_type: string | null;
  obtained_at: string | null;
  akte: string | null;
  price: string | null;
  submission_date: string | null;
  deed_date: string | null;
  notary: string | null;
}

export interface InzageSubjectPerson {
  subject_id: number;
  is_natural_person: boolean;
  name: string;
  gender: string | null;
  occupation: string | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  country: string | null;
  organizational_structure: string | null;
  address: string | null;
}

export interface InzageSubjectReport {
  kind: 'subject';
  variant: InzageSubjectVariant;
  system_key: string;
  system_name: string;
  is_production: boolean;
  title: string;
  generated_at: string;
  person: InzageSubjectPerson;
  rights: InzageSubjectRight[];
  /** For 'negatief': the declaration sentence. */
  declaration: string | null;
}

import type { SectionType } from './types';

export const SECTION_LABELS: Record<SectionType, string> = {
  BOARD: 'Board',
  SUPPORTERS: 'Board Supporters',
  ACTIVE: 'Active Members',
  MASCOTS: 'Mascotte',
  ALUMNI: 'Alumni Member',
};

export const SECTION_COLORS: Record<SectionType, string> = {
  BOARD: '#00aeef',
  SUPPORTERS: '#f47b20',
  ACTIVE: '#ec008c',
  MASCOTS: '#ec008c',
  ALUMNI: '#6c757d',
};

export const SECTION_BG: Record<SectionType, string> = {
  BOARD: 'rgba(0,174,239,0.08)',
  SUPPORTERS: 'rgba(244,123,32,0.08)',
  ACTIVE: 'rgba(236,0,140,0.08)',
  MASCOTS: 'rgba(236,0,140,0.08)',
  ALUMNI: 'rgba(108,117,125,0.10)',
};

export const SECTION_KEYS: SectionType[] = [
  'BOARD',
  'SUPPORTERS',
  'ACTIVE',
  'MASCOTS',
  'ALUMNI',
];

// Valori di default per i nuovi membri, per sezione
export const SECTION_NEW_MEMBER_DEFAULTS: Partial<
  Record<SectionType, { role: string; imageFilename: string }>
> = {
  ACTIVE: { role: 'Membro Attivo', imageFilename: 'esn_logo.jpg' },
  ALUMNI: { role: 'Alumno', imageFilename: 'esn_logo.jpg' },
};

// Sezioni che supportano l'import multiplo
export const BULK_IMPORT_SECTIONS: SectionType[] = ['ACTIVE', 'ALUMNI'];

export const ROLE_SUGGESTIONS = [
  'Presidente',
  'Vicepresidente',
  'Segretario',
  'Segretaria',
  'Tesoriere',
  'Tesoriera',
  'Webmaster',
  'Event Manager',
  'Partnership Manager',
  'Active Member',
  'Alumno',
  'Alumna',
  'Referente Reggio Emilia',
  'Responsabile AskErasmus',
  "Responsabile corso d'italiano",
  'Coordinatrice Culture',
  'Coordinatrice Education & Youth',
  'Coordinatore Environmental Sustainability',
  'Coordinatore Health & Well-Being',
  'Coordinatore Skills & Employability',
  'Coordinatore Social Inclusion',
];

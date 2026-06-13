import type { SectionsState, SectionType } from './types';

export function parseDrupalHtml(html: string): SectionsState {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const state: Partial<SectionsState> = {};

  // These labels must match exactly what's in your Drupal HTML aria-labels
  const sectionsConfig = [
    { key: 'BOARD' as SectionType, search: 'Board members' },
    { key: 'SUPPORTERS' as SectionType, search: 'Board Supporters' },
    { key: 'ACTIVE' as SectionType, search: 'Active Members' },
    { key: 'MASCOTS' as SectionType, search: 'Mascots' },
    { key: 'ALUMNI' as SectionType, search: 'Alumni Member' },
  ];

  sectionsConfig.forEach(({ key, search }) => {
    // Find the section by aria-label
    const sectionEl = Array.from(doc.querySelectorAll('section')).find((s) =>
      s.getAttribute('aria-label')?.includes(search),
    );

    if (sectionEl) {
      const items = Array.from(
        sectionEl.querySelectorAll('article[role="listitem"]'),
      );
      state[key] = items.map((article) => {
        const name = article.querySelector('h3')?.textContent?.trim() || '';
        const role =
          article.querySelector('p:last-of-type')?.textContent?.trim() || '';
        const img = article.querySelector('img')?.getAttribute('src') || '';
        const imageFilename = img.split('/').pop() || '';
        return { name, role, imageFilename };
      });
    } else {
      state[key] = [];
    }
  });

  return state as SectionsState;
}

export function imgUrl(filename?: string) {
  if (!filename) return '';
  return new URL(
    filename,
    'https://more.esn.it/sites/esnmodena.it/files/members/',
  ).href;
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

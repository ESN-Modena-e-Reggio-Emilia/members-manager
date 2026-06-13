import path from 'node:path';
import { Logger } from '@nestjs/common';
import { JSDOM } from 'jsdom';

// --- CONFIGURAZIONE ---
// Mappatura dei colori e delle etichette per ogni sezione
const SECTIONS = {
  BOARD: {
    id: 'board-section', // Useremo un selettore flessibile, ma questo identifica il tipo
    color: '#00aeef', // Ciano
    rgba: 'rgba(0, 174, 239, 0.12)',
    rgbaShadow: 'rgba(0, 174, 239, 0.3)',
    badgePrefix: 'Board',
  },
  SUPPORTERS: {
    ariaLabel: 'Board Supporters',
    color: '#f47b20', // Arancione
    rgba: 'rgba(244, 123, 32, 0.12)',
    rgbaShadow: 'rgba(244, 123, 32, 0.3)',
    badgeText: 'Board Supporter',
  },
  ACTIVE: {
    ariaLabel: 'Active Members',
    color: '#ec008c', // Magenta
    rgba: 'rgba(236, 0, 140, 0.12)',
    rgbaShadow: 'rgba(236, 0, 140, 0.3)',
    badgeText: 'Active Member',
  },
  MASCOTS: {
    ariaLabel: 'Mascots',
    color: '#ec008c', // Same magenta as Active Members
    rgba: 'rgba(236, 0, 140, 0.12)',
    rgbaShadow: 'rgba(236, 0, 140, 0.3)',
    badgeText: 'Mascotte',
  },
  ALUMNI: {
    ariaLabel: 'Alumni Member', // deve combaciare con l'aria-label della sezione nell'HTML
    color: '#6c757d', // Grigio
    rgba: 'rgba(108, 117, 125, 0.18)',
    rgbaShadow: 'rgba(108, 117, 125, 0.35)',
    badgeText: 'Alumni Member',
  },
} as const;

const ROLE_MAPPINGS: Record<string, string> = {
  Culture: 'Coordinatrice Culture',
  'Education & Youth': 'Coordinatrice Education & Youth',
  'Environmental Sustainability': 'Coordinatore Environmental Sustainability',
  'Health & Well Being': 'Coordinatore Health & Well-Being',
  'Skills & Employability': 'Coordinatore Skills & Employability',
  'Social Inclusion': 'Coordinatore Social Inclusion',
  'Responsabile Askerasmus': 'Responsabile AskErasmus',
  'Responsabile Corso di italiano': "Responsabile corso d'italiano",
  // Ruoli che rimangono invariati (opzionale)
  // "Webmaster": "Webmaster",
  // "Referente Reggio Emilia": "Referente Reggio Emilia",
  // "Event Manager": "Event Manager",
  // "Partnership Manager": "Partnership Manager"
} as const;

export type SectionType =
  | 'BOARD'
  | 'SUPPORTERS'
  | 'ACTIVE'
  | 'MASCOTS'
  | 'ALUMNI';

export interface MemberData {
  name: string;
  role: string;
  imageFilename?: string; // Se non fornito, genera da nome_cognome.jpg
  isMascotte?: boolean; // Se true, non applica logiche standard di immagine
}

interface AddMemberOptions {
  afterMemberName?: string;
  position?: 'start' | 'end'; // default: "start"
  replaceIfExists?: boolean; // default: false — se true, rimuove il membro esistente prima di aggiungerlo
}

interface RemoveMemberOptions {
  section?: SectionType; // Se specificato, rimuove il membro solo da questa sezione
}

interface SectionConfig {
  id?: string;
  color: string;
  rgba: string;
  rgbaShadow: string;
  badgePrefix?: string;
  ariaLabel?: string;
  badgeText?: string;
}

export class ESNPageManager {
  private dom: JSDOM;
  private document: Document;

  constructor(
    htmlContent: string,
    private readonly logger: Logger,
  ) {
    this.dom = new JSDOM(htmlContent);
    this.document = this.dom.window.document;
  }

  /**
   * Aggiorna l'anno del Board (es. da 2025-2026 a 2026-2027)
   * Aggiorna Titoli, ID, Descrizioni e i Badge delle card esistenti.
   */
  public updateBoardYear(newYear: string): void {
    // Trova la sezione Board (cerca l'h2 che inizia con "Board")
    const headings = Array.from(this.document.querySelectorAll('h2'));
    const boardHeading = headings.find((h) => h.textContent?.includes('Board'));

    if (!boardHeading) throw new Error('Sezione Board non trovata.');

    const section = boardHeading.closest('section');
    if (!section) throw new Error('Container sezione Board non trovato.');

    // Aggiorna Heading
    boardHeading.textContent = `Board ${newYear}`;
    boardHeading.id = `board-${newYear}-heading`;

    // Aggiorna attributi della sezione
    section.setAttribute('aria-labelledby', `board-${newYear}-heading`);
    section.setAttribute('aria-describedby', `board-${newYear}-desc`);
    section.setAttribute('aria-label', `Board members ${newYear}`);

    // Aggiorna descrizione nascosta
    const desc = section.querySelector('p[style*="clip: rect"]');
    if (desc) {
      desc.id = `board-${newYear}-desc`;
      desc.textContent = `Sezione dedicata al Consiglio Direttivo ${newYear} / Profiles of the elected Board for ${newYear}.`;
    }

    // Aggiorna sottotitolo visibile
    const subtitle = section.querySelector('div > p');
    if (subtitle && !subtitle.getAttribute('style')?.includes('clip: rect')) {
      subtitle.textContent = `Sezione dedicata al Consiglio Direttivo ${newYear} / Profiles of the elected Board for ${newYear}.`;
    }

    // Aggiorna i badge sulle card esistenti del Board
    const badges = section.querySelectorAll('p[style*="border-radius: 999px"]');
    badges.forEach((badge) => {
      badge.textContent = `Board ${newYear}`;
    });

    this.logger.log(`✅ Anno aggiornato a: ${newYear}`);
  }

  /**
   * Cerca in quale sezione si trova un membro.
   * Restituisce il tipo di sezione (es. 'BOARD') o null se non trovato.
   */
  public findMemberSection(name: string): SectionType | null {
    // Itera su tutte le chiavi definite in SECTIONS (BOARD, SUPPORTERS, etc.)
    const types = Object.keys(SECTIONS) as SectionType[];

    for (const type of types) {
      const section = this.findSection(type);
      if (!section) continue;

      // Cerca tra gli h3 delle card in questa specifica sezione
      const headings = Array.from(
        section.querySelectorAll('article[role="listitem"] h3'),
      );
      const match = headings.find(
        (h3) =>
          h3.textContent?.trim().toLowerCase() === name.trim().toLowerCase(),
      );

      if (match) {
        return type;
      }
    }
    return null;
  }

  /**
   * Aggiunge un membro a una sezione specifica.
   * Opzionale: afterMemberName per inserirlo dopo uno specifico membro.
   */
  public addMember(
    type: SectionType,
    data: MemberData,
    options?: AddMemberOptions,
  ): void {
    // Controllo duplicati
    const existingSection = this.findMemberSection(data.name);

    if (existingSection) {
      if (options?.replaceIfExists) {
        // non uso { section: existingSection } perché spesso uno vuole spostare
        // un membro da una sezione all'altra, quindi va prima tolto del tutto
        this.removeMember(data.name);
        this.logger.log(
          `🔄 Membro '${data.name}' rimosso da '${existingSection}' per sostituzione.`,
        );
      } else {
        this.logger.warn(
          `⚠️ WARNING: Il membro '${data.name}' è già presente nella sezione '${existingSection}'. Operazione annullata per evitare duplicati.`,
        );
        return;
      }
    }

    const config = SECTIONS[type];
    const section = this.findSection(type);
    const grid = section.querySelector('[role="list"]');

    if (!grid) throw new Error(`Griglia non trovata per la sezione ${type}`);

    // Calcola filename immagine
    let imgSrc = '';
    if (data.imageFilename) {
      imgSrc = `./sites/esnmodena.it/files/members/${data.imageFilename}`;
    } else {
      const cleanName = data.name.toLowerCase().replace(/ /g, '_');
      imgSrc = `./sites/esnmodena.it/files/members/${cleanName}.jpg`;
    }

    // Calcola testo Badge
    let badgeLabel = '';
    if (type === 'BOARD') {
      const headingText = section.querySelector('h2')?.textContent || 'Board';
      badgeLabel = headingText;
    } else {
      if (!('badgeText' in config)) {
        throw new Error(
          `Configurazione mancante per badgeText in sezione ${type}`,
        );
      }
      badgeLabel = config.badgeText ?? '';
    }

    // Se il ruolo esiste nella mappatura usa quello, altrimenti usa l'originale
    const displayRole = ROLE_MAPPINGS[data.role] || data.role;

    // Creiamo un nuovo oggetto dati con il ruolo aggiornato per la generazione HTML
    const renderData = { ...data, role: displayRole };

    // Genera HTML Card
    const cardHTML = this.generateCardHTML(
      config,
      renderData,
      imgSrc,
      badgeLabel,
    );

    // Logica posizionamento
    const { afterMemberName, position = 'start' } = options ?? {};
    let inserted = false;

    if (afterMemberName) {
      // Cerca la card del membro dopo cui inserire
      const articles = Array.from(
        grid.querySelectorAll('article[role="listitem"]'),
      );
      const targetArticle = articles.find(
        (article) =>
          article.querySelector('h3')?.textContent?.trim().toLowerCase() ===
          afterMemberName.trim().toLowerCase(),
      );

      if (targetArticle) {
        targetArticle.insertAdjacentHTML('afterend', cardHTML);
        inserted = true;
        this.logger.log(
          `✅ Aggiunto membro: ${data.name} in ${type} (dopo ${afterMemberName}, Ruolo: ${displayRole})`,
        );
      } else {
        this.logger.warn(
          `⚠️ Target '${afterMemberName}' non trovato in ${type}. Aggiungo in ${position === 'end' ? 'fondo' : 'cima'}.`,
        );
      }
    }

    // Default: inserisci in base a position (start = afterbegin, end = beforeend)
    if (!inserted) {
      const insertPosition = position === 'end' ? 'beforeend' : 'afterbegin';
      grid.insertAdjacentHTML(insertPosition, cardHTML);
      this.logger.log(
        `✅ Aggiunto membro: ${data.name} in ${type} (${position === 'end' ? 'in fondo' : 'in cima'}, Ruolo: ${displayRole})`,
      );
    }
  }

  /**
   * Rimuove le occorrenze di un membro dato il nome.
   * Se specificata una sezione nelle opzioni, rimuove solo da quella sezione.
   */
  public removeMember(name: string, options?: RemoveMemberOptions): void {
    // Determina il contesto di ricerca: o una sezione specifica o tutto il documento
    let searchContext: ParentNode = this.document;
    let contextName = 'tutte le sezioni';

    if (options?.section) {
      const sectionEl = this.findSection(options.section);
      if (!sectionEl)
        throw new Error(`Sezione ${options.section} non trovata.`);
      searchContext = sectionEl;
      contextName = `sezione ${options.section}`;
    }

    const articles = searchContext.querySelectorAll('article[role="listitem"]');
    let found = false;

    articles.forEach((article) => {
      const h3 = article.querySelector('h3');
      if (
        h3 &&
        h3.textContent?.trim().toLowerCase() === name.trim().toLowerCase()
      ) {
        article.remove();
        found = true;
        this.logger.log(`🗑️ Rimosso membro: ${name} (da ${contextName})`);
      }
    });

    if (!found) {
      // Se avevamo specificato una sezione, è utile specificarlo nell'errore
      const errorMsg = `Membro non trovato: ${name} in ${contextName}`;
      // Puoi decidere se lanciare errore o fare solo un warn.
      // Qui mantengo il throw come da tuo codice originale, ma spesso nei loop è meglio un warn.
      throw new Error(errorMsg);
    }
  }

  /**
   * Restituisce l'HTML completo processato
   */
  public getOutput(): string {
    return this.dom.serialize();
  }

  // --- HELPERS ---

  private findSection(type: SectionType): HTMLElement {
    const sections = Array.from(this.document.querySelectorAll('section'));

    if (type === 'BOARD') {
      return sections.find((s) =>
        s.querySelector('h2')?.textContent?.includes('Board'),
      ) as HTMLElement;
    } else {
      const label = SECTIONS[type].ariaLabel;
      return sections.find((s) =>
        s.getAttribute('aria-label')?.includes(label),
      ) as HTMLElement;
    }
  }

  private generateCardHTML(
    config: SectionConfig,
    data: MemberData,
    imgSrc: string,
    badgeLabel: string,
  ): string {
    // Stringa HTML cruda con stili inline e attributi JS per hover
    return `
      <article role='listitem' tabindex='0' style="background: #ffffff; border-radius: 16px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); display: flex; flex-direction: column; align-items: center; gap: 0.65rem; padding: 1.5rem; text-align: center; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1); min-height: 100%; outline: 3px solid transparent; outline-offset: 4px; will-change: transform; cursor: default; position: relative; -webkit-tap-highlight-color: rgba(0,0,0,0); border-top: 4px solid ${config.color};" data-accent='${config.color}' onmouseover="var accent=this.getAttribute('data-accent'); this.style.boxShadow='0 8px 24px rgba(0, 0, 0, 0.16)'; this.style.transform='translateY(-6px)'; var heading=this.querySelector('h3'); if(heading){heading.style.color=accent;} var image=this.querySelector('img'); if(image){image.style.transform='scale(1.05)'; image.style.filter='grayscale(0%)';}" onmouseout="this.style.boxShadow='0 2px 8px rgba(0, 0, 0, 0.08)'; this.style.transform='translateY(0)'; this.style.outline='3px solid transparent'; var heading=this.querySelector('h3'); if(heading){heading.style.color='var(--esn-ink, #1a1a1a)';} var image=this.querySelector('img'); if(image){var reset=image.getAttribute('data-grayscale')==='true'?'grayscale(100%)':'grayscale(0%)'; image.style.transform='scale(1)'; image.style.filter=reset;}" onfocus="var accent=this.getAttribute('data-accent'); this.style.boxShadow='0 8px 24px rgba(0, 0, 0, 0.16)'; this.style.transform='translateY(-6px)'; this.style.outline='3px solid '+accent; var heading=this.querySelector('h3'); if(heading){heading.style.color=accent;} var image=this.querySelector('img'); if(image){image.style.transform='scale(1.05)'; image.style.filter='grayscale(0%)';}" onblur="this.style.boxShadow='0 2px 8px rgba(0, 0, 0, 0.08)'; this.style.transform='translateY(0)'; this.style.outline='3px solid transparent'; var heading=this.querySelector('h3'); if(heading){heading.style.color='var(--esn-ink, #1a1a1a)';} var image=this.querySelector('img'); if(image){var reset=image.getAttribute('data-grayscale')==='true'?'grayscale(100%)':'grayscale(0%)'; image.style.transform='scale(1)'; image.style.filter=reset;}" aria-label="${data.name}, ${data.role}">
        <p style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; margin: 0; padding: 0.2rem 0.85rem; border-radius: 999px; background: ${config.rgba}; color: ${config.color};">${badgeLabel}</p>
        <figure style="margin: 0; width: 144px; height: 144px; display: flex; align-items: center; justify-content: center;">
          <img src="${imgSrc}" alt="${data.name}, ${data.role} - ESN Modena e Reggio Emilia" title="${data.name}, ${data.role} - ESN Modena e Reggio Emilia" loading="lazy" decoding="async" width="128" height="128" data-grayscale="false" style="width: 128px; height: 128px; aspect-ratio: 1 / 1; border-radius: 50%; object-fit: cover; transition: transform 0.3s ease, filter 0.3s ease; border: 4px solid #ffffff; box-shadow: 0 0 0 3px ${config.rgbaShadow}; filter: grayscale(0%);" />
        </figure>
        <h3 style="font-size: 1.15rem; font-weight: 600; letter-spacing: -0.01em; margin: 0; color: var(--esn-ink, #1a1a1a);">${data.name}</h3>
        <p style="font-size: 0.95rem; margin: 0; font-weight: 600; letter-spacing: 0.01em; color: ${config.color};">${data.role}</p>
      </article>`;
  }

  // Metodo per estrarre lo stato attuale dell'HTML in formato JSON
  public getJsonState(): Record<string, MemberData[]> {
    const state: Record<string, MemberData[]> = {};
    const sectionKeys = Object.keys(SECTIONS) as SectionType[];

    sectionKeys.forEach((key) => {
      const sectionEl = this.findSection(key);
      if (!sectionEl) return;

      const items = Array.from(
        sectionEl.querySelectorAll('article[role="listitem"]'),
      );
      state[key] = items.map((article) => {
        const name = article.querySelector('h3')?.textContent || '';
        const role = article.querySelector('p:last-of-type')?.textContent || '';
        const imgEl = article.querySelector('img');
        // Estrae solo il nome del file dal path
        const imageFilename = imgEl ? path.basename(imgEl.src) : '';

        return { name, role, imageFilename };
      });
    });

    return state;
  }

  // Metodo per rigenerare completamente una sezione basandosi su una lista
  public updateSectionFromList(type: SectionType, members: MemberData[]): void {
    const sectionEl = this.findSection(type);
    const grid = sectionEl?.querySelector('[role="list"]');
    if (!grid) throw new Error(`Grid non trovata per ${type}`);

    // Svuota la griglia attuale
    grid.innerHTML = '';

    // Rigenera le card nell'ordine ricevuto
    const config = SECTIONS[type];
    members.forEach((member) => {
      // Calcola path e badge come nel tuo script originale
      const imgSrc = `./sites/esnmodena.it/files/members/${member.imageFilename}`;

      let badgeLabel = '';
      if (type === 'BOARD') {
        badgeLabel = sectionEl.querySelector('h2')?.textContent || 'Board';
      } else {
        // check per typescript
        if (!('badgeText' in config)) {
          throw new Error(
            `Configurazione mancante per badgeText in sezione ${type}`,
          );
        }
        badgeLabel = config.badgeText || '';
      }

      // Usa il mapping dei ruoli se necessario
      const displayRole = ROLE_MAPPINGS[member.role] || member.role;

      // Genera HTML
      const cardHTML = this.generateCardHTML(
        config,
        { ...member, role: displayRole },
        imgSrc,
        badgeLabel,
      );

      // Inserisci
      grid.insertAdjacentHTML('beforeend', cardHTML);
    });
  }
}

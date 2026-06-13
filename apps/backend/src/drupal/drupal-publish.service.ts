import { Injectable, Logger } from '@nestjs/common';
import type { Page } from 'puppeteer';
import { CacheService } from '../cache/cache.service';
import { DrupalAuthService } from './drupal-auth.service';
import { DrupalContentService } from './drupal-content.service';

const NODE_EDIT_URL = 'https://more.esn.it/?q=node/104/edit';
const BODY_SELECTOR = '#edit-body-und-0-value';
const SUBMIT_SELECTOR = '#edit-submit';

/**
 * Thrown when the content saved on Drupal does not match the HTML we intended
 * to publish. Signals the orchestrator NOT to commit the new HTML as the
 * source of truth (the drift snapshot already protects the prior state).
 */
export class PublishVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishVerificationError';
  }
}

/**
 * Normalizes HTML for a tolerant comparison: unifies line endings and trims
 * leading/trailing whitespace. Drupal/textarea round-trips can add a trailing
 * newline or normalize \r\n, but must not alter the meaningful content.
 */
function normalizeHtml(html: string): string {
  return html.replace(/\r\n/g, '\n').trim();
}

@Injectable()
export class DrupalPublishService {
  private readonly logger = new Logger(DrupalPublishService.name);
  // Simple in-service mutex: a publish is a write, never run two at once.
  private publishPromise: Promise<void> | null = null;

  constructor(
    private readonly authService: DrupalAuthService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Logs into Drupal, writes `newHtml` into node 104's body field (working
   * around the attached WYSIWYG editor), saves, verifies the saved content
   * matches, and invalidates the content cache. Streams progress via `onLog`.
   *
   * Throws PublishVerificationError if the re-read content doesn't match.
   */
  async publishAboutUs(
    newHtml: string,
    onLog?: (msg: string) => void,
  ): Promise<void> {
    if (this.publishPromise) {
      onLog?.('Another publish is already running, waiting for it...');
      throw new Error(
        'Una pubblicazione è già in corso. Riprova tra qualche secondo.',
      );
    }

    this.publishPromise = this.doPublish(newHtml, onLog).finally(() => {
      this.publishPromise = null;
    });
    return this.publishPromise;
  }

  private async doPublish(
    newHtml: string,
    onLog?: (msg: string) => void,
  ): Promise<void> {
    // Pass the edit page as the post-login destination so Drupal lands us
    // there directly instead of bouncing through the site front page.
    const { browser, page } = await this.authService.getAuthenticatedSession(
      onLog,
      'node/104/edit',
    );

    try {
      // Only navigate if the post-login redirect didn't already land us here.
      if (!page.url().includes('node/104/edit')) {
        onLog?.('Navigating to node editor...');
        await page.goto(NODE_EDIT_URL, { waitUntil: 'networkidle2' });
      } else {
        onLog?.('Landed on the node editor after login.');
      }
      await page.waitForSelector(BODY_SELECTOR, { timeout: 20000 });

      onLog?.('Neutralizing the WYSIWYG editor...');
      await this.disableWysiwyg(page, onLog);

      onLog?.('Writing the new HTML into the body field...');
      const written = await page.evaluate(
        (selector, html) => {
          const textarea = document.querySelector(
            selector,
          ) as HTMLTextAreaElement | null;
          if (!textarea) return { ok: false, length: 0 };
          textarea.value = html;
          // Defensively keep the wysiwyg "original" attribute in sync so a
          // re-attach on submit cannot restore the old content.
          textarea.setAttribute('data-wysiwyg-value-original', html);
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, length: textarea.value.length };
        },
        BODY_SELECTOR,
        newHtml,
      );

      if (!written.ok) {
        throw new Error('Body textarea not found on the edit page.');
      }
      this.logger.debug(`Body field set (length: ${written.length})`);

      onLog?.('Submitting the form (Save)...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click(SUBMIT_SELECTOR),
      ]);

      // Check for Drupal status / error messages after save.
      const messages = await page.evaluate(() => {
        const text = (sel: string) =>
          Array.from(document.querySelectorAll(sel))
            .map((el) => el.textContent?.trim() || '')
            .filter(Boolean)
            .join(' | ');
        return {
          status: text('.messages.status, .messages--status'),
          error: text('.messages.error, .messages--error'),
        };
      });

      if (messages.error) {
        throw new Error(`Drupal ha riportato un errore: ${messages.error}`);
      }
      onLog?.(
        messages.status
          ? `Drupal: ${messages.status}`
          : 'Form inviato (nessun messaggio di stato).',
      );

      // --- Verification: re-read the saved body and compare ---
      onLog?.('Verifying the saved content...');
      await page.goto(NODE_EDIT_URL, { waitUntil: 'networkidle2' });
      await page.waitForSelector(BODY_SELECTOR, { timeout: 20000 });
      const savedValue = await page.evaluate((selector) => {
        const textarea = document.querySelector(
          selector,
        ) as HTMLTextAreaElement | null;
        // Prefer the server-rendered default value over a possibly
        // editor-mutated live value.
        return textarea ? (textarea.defaultValue ?? textarea.value) : null;
      }, BODY_SELECTOR);

      if (savedValue === null) {
        throw new PublishVerificationError(
          'Impossibile rileggere il contenuto salvato per la verifica.',
        );
      }

      if (normalizeHtml(savedValue) !== normalizeHtml(newHtml)) {
        const detail = this.describeMismatch(newHtml, savedValue);
        throw new PublishVerificationError(
          `Il contenuto salvato non corrisponde a quello previsto. ${detail}`,
        );
      }

      onLog?.('Verified: saved content matches the intended HTML.');

      // Invalidate the cached content so the next read reflects the new state.
      await this.cacheService.delete(DrupalContentService.CACHE_KEY);
      onLog?.('Content cache invalidated.');

      // Clear the Drupal site cache so the public website shows the new content
      // immediately. Reuse the already-authenticated page. Non-fatal: the save
      // already succeeded, so a cache-clear hiccup must not fail the publish.
      try {
        onLog?.('Clearing the Drupal site cache...');
        await page.goto(
          'https://more.esn.it/?q=admin/config/development/performance',
          { waitUntil: 'networkidle2' },
        );
        await page.waitForSelector('#edit-clear', { timeout: 15000 });
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }),
          page.click('#edit-clear'),
        ]);
        onLog?.('Drupal site cache cleared.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Site cache clear failed (non-fatal): ${msg}`);
        onLog?.(
          'Attenzione: non sono riuscito a svuotare la cache del sito. ' +
            'Falla manualmente da Drupal se il sito non si aggiorna.',
        );
      }
    } finally {
      this.logger.debug('Closing browser');
      await browser.close();
    }
  }

  /**
   * Disables the Drupal "wysiwyg" rich-text editor attached to the body field,
   * so the raw textarea becomes the source of truth on submit. Tries the
   * native toggle link first, then the Drupal.wysiwyg JS API as a fallback.
   * No-op if no editor is attached.
   */
  private async disableWysiwyg(
    page: Page,
    onLog?: (msg: string) => void,
  ): Promise<void> {
    const attached = await page.evaluate((selector) => {
      const textarea = document.querySelector(selector);
      const hasClass = !!textarea?.classList.contains('wysiwyg-processed');
      // The toggle link id in the D7 wysiwyg module is derived from the
      // textarea id (e.g. wysiwyg-toggle-edit-body-und-0-value).
      const id = (textarea?.id || '').replace(/^#/, '');
      const toggle = document.getElementById(`wysiwyg-toggle-${id}`);
      return {
        hasClass,
        toggleText: toggle?.textContent?.trim() || '',
      };
    }, BODY_SELECTOR);

    if (!attached.hasClass && !attached.toggleText) {
      onLog?.('No WYSIWYG editor attached — using the raw textarea.');
      return;
    }

    // Approach B: click the native "Disable rich-text editor" toggle.
    const clicked = await page.evaluate((selector) => {
      const textarea = document.querySelector(selector);
      const id = textarea?.id || '';
      const toggle = document.getElementById(`wysiwyg-toggle-${id}`);
      if (
        toggle &&
        /disable|disabilita|plain text|testo normale/i.test(
          toggle.textContent || '',
        )
      ) {
        (toggle as HTMLElement).click();
        return true;
      }
      return false;
    }, BODY_SELECTOR);

    if (clicked) {
      try {
        await page.waitForFunction(
          (selector) => {
            const textarea = document.querySelector(selector);
            return !textarea?.classList.contains('wysiwyg-processed');
          },
          { timeout: 5000 },
          BODY_SELECTOR,
        );
        onLog?.('Rich-text editor disabled via toggle.');
        return;
      } catch {
        this.logger.warn('Toggle click did not detach the editor, trying API');
      }
    }

    // Approach A (fallback): use the Drupal.wysiwyg JS API directly.
    const detached = await page.evaluate((selector) => {
      const textarea = document.querySelector(
        selector,
      ) as HTMLTextAreaElement | null;
      const w = (
        window as unknown as {
          Drupal?: {
            wysiwyg?: {
              detach?: (...args: unknown[]) => void;
              instances?: Record<string, unknown>;
            };
          };
        }
      ).Drupal?.wysiwyg;
      if (!textarea || !w) return false;
      const id = textarea.id;
      try {
        if (typeof w.detach === 'function') {
          // Different wysiwyg versions accept different signatures; try the
          // documented one and ignore failures.
          try {
            w.detach(document, { wysiwyg: id }, 'unload');
          } catch {
            w.detach(document, {});
          }
        }
        if (w.instances?.[id]) delete w.instances[id];
        textarea.classList.remove('wysiwyg-processed');
        return true;
      } catch {
        return false;
      }
    }, BODY_SELECTOR);

    if (detached) {
      onLog?.('Rich-text editor detached via Drupal API.');
    } else {
      onLog?.(
        'Could not cleanly disable the editor; proceeding (verification will catch issues).',
      );
    }
  }

  /** Builds a short human-readable description of where two strings diverge. */
  private describeMismatch(expected: string, actual: string): string {
    const a = normalizeHtml(expected);
    const b = normalizeHtml(actual);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const snippet = (s: string) =>
      s.slice(Math.max(0, i - 20), i + 20).replace(/\n/g, '⏎');
    return `Lunghezza attesa ${a.length}, salvata ${b.length}; prima differenza al carattere ${i} (atteso "…${snippet(a)}…", salvato "…${snippet(b)}…").`;
  }
}

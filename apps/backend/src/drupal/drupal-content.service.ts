import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { firstValueFrom } from 'rxjs';
import { CacheService } from '../cache/cache.service';
import { DrupalAuthService } from './drupal-auth.service';

@Injectable()
export class DrupalContentService {
  private readonly logger = new Logger(DrupalContentService.name);
  private readonly CACHE_KEY = 'drupal_about_us_content';
  private readonly CACHE_TTL = 3600000; // 1 hour in milliseconds
  private fetchPromise: Promise<string> | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly authService: DrupalAuthService,
    private readonly cacheService: CacheService,
  ) {}

  async getAboutUsContent(
    onLog?: (msg: string) => void,
    retry = true,
  ): Promise<string> {
    this.logger.debug('getAboutUsContent called');
    // 0. Check Cache First
    const cachedContent = await this.cacheService.get<string>(this.CACHE_KEY);
    if (cachedContent !== null) {
      this.logger.debug(
        `Content found in cache (length: ${cachedContent.length})`,
      );
      onLog?.('Content retrieved from cache.');
      return cachedContent;
    }
    this.logger.debug('Content not in cache');

    // Prevent thundering herd: if a fetch is already in progress, wait for it
    if (this.fetchPromise) {
      this.logger.debug('Fetch already in progress, waiting...');
      onLog?.(
        'Content fetch already in progress, waiting for ongoing request...',
      );
      return this.fetchPromise;
    }

    // Start the fetch and store the promise to prevent concurrent requests
    this.logger.debug('Starting new content fetch');
    onLog?.('Content not in cache, starting fetch...');
    this.fetchPromise = this.performFetch(onLog, retry).finally(() => {
      this.fetchPromise = null;
    });

    return this.fetchPromise;
  }

  private async performFetch(
    onLog?: (msg: string) => void,
    retry = true,
  ): Promise<string> {
    // 1. Get the cookie (either from cache or fresh login)
    const cookie = await this.authService.getSessionCookie(onLog);

    try {
      this.logger.debug('Starting fetch request to Drupal');
      onLog?.('Fetching content via Axios...');

      // 2. Make the HTTP Request
      const response = await firstValueFrom(
        this.httpService.get('https://more.esn.it/?q=node/104/edit', {
          headers: {
            Cookie: cookie,
            // Mimic a browser just in case
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        }),
      );
      this.logger.debug(
        `HTTP response received (status: ${response.status}, data length: ${(response.data as string).length})`,
      );

      // 3. Parse HTML with Cheerio
      onLog?.('Parsing content with Cheerio...');
      const $ = cheerio.load(response.data as string);
      this.logger.debug('HTML parsed with Cheerio');

      // Select the textarea and get its value
      const content = $('#edit-body-und-0-value').val(); // .val() for inputs/textareas

      if (typeof content !== 'string') {
        this.logger.warn('Textarea not found. Cookie might be invalid.');
        throw new UnauthorizedException('Content not found');
      }
      this.logger.debug(
        `Content extracted from textarea (length: ${content.length})`,
      );

      // Store in cache
      await this.cacheService.set(this.CACHE_KEY, content, this.CACHE_TTL);
      this.logger.debug('Content cached successfully');
      onLog?.('Content retrieved successfully and cached.');
      return content;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.debug(`Fetch error: ${errorMessage}`);
      // 4. Retry Logic: If Axios gets a 403/401, the cookie might be stale.
      if (retry) {
        this.logger.debug(
          'Clearing cache and retrying (no more retries after this)',
        );
        this.logger.warn('Request failed. Invalidating cache and retrying...');
        // Clear the cache to force a fresh fetch on retry
        await this.cacheService.delete(this.CACHE_KEY);
        // For now, we'll just let the recursive call handle it if you implement cache clearing.
        // Ideally: await this.authService.invalidateCache();
        return this.performFetch(onLog, false);
      }
      this.logger.debug('Max retries reached, throwing error');
      throw error;
    }
  }
}

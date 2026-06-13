import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer, { Browser, Page } from 'puppeteer';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class DrupalAuthService implements OnModuleInit {
  private readonly logger = new Logger(DrupalAuthService.name);
  private readonly CACHE_KEY = 'drupal_session_cookie';
  private readonly CACHE_TTL = 1000 * 60 * 60 * 2; // 2 hours in milliseconds
  private drupalUsername: string;
  private drupalPassword: string;
  private refreshPromise: Promise<string> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {}

  onModuleInit() {
    // Check required environment variables at startup
    const drupalUsername = this.configService.get('DRUPAL_USERNAME');
    const drupalPassword = this.configService.get('DRUPAL_PASSWORD');

    if (!drupalUsername || !drupalPassword) {
      throw new Error(
        'DRUPAL_USERNAME and DRUPAL_PASSWORD environment variables must be set',
      );
    }

    this.drupalUsername = drupalUsername;
    this.drupalPassword = drupalPassword;

    this.logger.log('Drupal credentials configured');
  }

  /**
   * Returns a valid cookie string for HTTP headers.
   * If cached and fresh, returns immediately.
   * If missing or expired, launches Puppeteer to login first.
   * Uses a lock mechanism to prevent thundering herd when multiple
   * concurrent requests need to refresh the token.
   */
  async getSessionCookie(onLog?: (msg: string) => void): Promise<string> {
    this.logger.debug('getSessionCookie called');
    // Check cache first
    const cachedCookie = await this.cacheService.get<string>(this.CACHE_KEY);
    if (cachedCookie !== null) {
      this.logger.debug('Session cookie found in cache');
      onLog?.('Using cached session cookie.');
      return cachedCookie;
    }
    this.logger.debug('Session cookie not in cache or expired');

    // If a refresh is already in progress, wait for it instead of starting a new one
    if (this.refreshPromise) {
      this.logger.debug('Refresh already in progress, waiting...');
      onLog?.('Login already in progress, waiting for ongoing refresh...');
      return this.refreshPromise;
    }

    // Start the refresh and store the promise to prevent concurrent refreshes
    this.logger.debug('Starting new session refresh');
    onLog?.('Cookie missing or expired. Starting Puppeteer login...');
    this.refreshPromise = this.performPuppeteerLogin(onLog)
      .then((cookie) => {
        // Cache the cookie with TTL
        this.cacheService.set(this.CACHE_KEY, cookie, this.CACHE_TTL);
        return cookie;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  private async performPuppeteerLogin(
    onLog?: (msg: string) => void,
  ): Promise<string> {
    const { browser, page } = await this.launchAndLogin(onLog);

    try {
      onLog?.('Login successful! Extracting cookies...');

      // --- EXTRACT COOKIES ---
      const cookies = await page.cookies();
      this.logger.debug(`Extracted ${cookies.length} cookies from page`);

      // Convert Puppeteer cookie objects to a standard "key=value; " header string
      const cookieString = cookies
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
      this.logger.debug(
        `Cookie string created (length: ${cookieString.length})`,
      );

      return cookieString;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.debug(`Login error: ${errorMessage}`);
      onLog?.(`Error: ${errorMessage}`);
      throw error;
    } finally {
      this.logger.debug('Closing browser');
      await browser.close();
    }
  }

  /**
   * Public entry point for other services (e.g. publishing) that need an
   * authenticated browser/page to interact with admin forms. Performs a fresh
   * login each time to avoid stale form tokens / build ids on write
   * operations. The caller is responsible for closing the browser
   * (`browser.close()` in a `finally`).
   */
  async getAuthenticatedSession(
    onLog?: (msg: string) => void,
    destination?: string,
  ): Promise<{ browser: Browser; page: Page }> {
    return this.launchAndLogin(onLog, destination);
  }

  /**
   * Launches a Puppeteer browser, performs the login flow and returns the
   * authenticated browser/page so callers can keep interacting with the site
   * (e.g. submit admin forms). The caller is responsible for closing the
   * browser.
   */
  private async launchAndLogin(
    onLog?: (msg: string) => void,
    destination?: string,
  ): Promise<{ browser: Browser; page: Page }> {
    onLog?.('Launching browser...');
    const browser = await puppeteer.launch({
      // Headless in production, non-headless in dev for easier debugging
      headless: this.configService.get('NODE_ENV') !== 'development',
      executablePath: this.configService.get('PUPPETEER_EXECUTABLE_PATH'),
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      // --- YOUR LOGIN LOGIC HERE ---
      // A destination makes Drupal redirect straight there after login,
      // avoiding a wasteful hop through the site front page.
      const loginUrl = destination
        ? `https://more.esn.it/?q=user/login&destination=${encodeURIComponent(destination)}`
        : 'https://more.esn.it/?q=user/login';
      onLog?.('Navigating to login page...');
      await page.goto(loginUrl, {
        waitUntil: 'networkidle2',
      });

      // Trigger Antibot
      onLog?.('I am really not a bot...');
      await page.mouse.move(100, 100);
      await page.keyboard.press('Tab');

      // Wait for and click the custom login link
      onLog?.('Filling credentials...');
      await page.waitForSelector('.uncas-link');
      await page.click('.uncas-link');

      // Fill form
      await page.waitForSelector('#edit-name');
      await page.type('#edit-name', this.drupalUsername);
      await page.type('#edit-pass', this.drupalPassword);

      // Submit
      onLog?.('Submitting form...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('#edit-submit'),
      ]);

      return { browser, page };
    } catch (error) {
      // Make sure we don't leak a browser if login fails before we hand it off
      await browser.close();
      throw error;
    }
  }

  /**
   * Logs into Drupal and clicks "Clear all caches" on the performance
   * settings page. This flushes the Drupal site cache so freshly saved
   * content becomes visible on the public website.
   */
  async clearDrupalSiteCache(onLog?: (msg: string) => void): Promise<void> {
    this.logger.debug('clearDrupalSiteCache called');
    const { browser, page } = await this.launchAndLogin(onLog);

    try {
      onLog?.('Navigating to performance settings...');
      await page.goto(
        'https://more.esn.it/?q=admin/config/development/performance',
        { waitUntil: 'networkidle2' },
      );

      onLog?.('Clicking "Clear all caches"...');
      await page.waitForSelector('#edit-clear');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('#edit-clear'),
      ]);

      this.logger.log('Drupal site cache cleared successfully');
      onLog?.('Drupal site cache cleared successfully!');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.debug(`Clear cache error: ${errorMessage}`);
      onLog?.(`Error: ${errorMessage}`);
      throw error;
    } finally {
      this.logger.debug('Closing browser');
      await browser.close();
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer, { ElementHandle, Frame } from 'puppeteer';
import { DrupalAuthService } from './drupal-auth.service';

// Define a simpler interface that matches both Multer and local files
export interface UploadableFile {
  path: string;
  originalname: string;
}

@Injectable()
export class DrupalImageService {
  private readonly logger = new Logger(DrupalImageService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: DrupalAuthService,
  ) {}

  async uploadImages(
    files: Array<UploadableFile>,
    onLog?: (msg: string) => void,
  ): Promise<{ filename: string; status: 'success' | 'error' }[]> {
    const results: { filename: string; status: 'success' | 'error' }[] = [];
    let browser = null;

    try {
      this.logger.debug(`Starting upload for ${files.length} files`);
      onLog?.('Initializing browser for upload...');

      // Get the Session Cookie String
      const cookieString = await this.authService.getSessionCookie(onLog);
      this.logger.debug('Session cookie obtained');

      // Launch Browser
      this.logger.debug(
        `Launching browser (headless: ${this.configService.get('NODE_ENV') !== 'development'})`,
      );
      browser = await puppeteer.launch({
        headless: this.configService.get('NODE_ENV') !== 'development',
        executablePath: this.configService.get('PUPPETEER_EXECUTABLE_PATH'),
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.logger.debug('Browser launched');

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      this.logger.debug('Page created and viewport set');

      // Set Cookies (Parse string back to objects)
      const cookies = this.parseCookieString(cookieString, 'more.esn.it');
      this.logger.debug(`Setting ${cookies.length} cookies on page`);
      await page.setCookie(...cookies);

      // Navigate to IMCE
      this.logger.debug('Navigating to IMCE File Manager...');
      onLog?.('Navigating to IMCE File Manager...');
      await page.goto('https://more.esn.it/?q=user/1/imce', {
        waitUntil: 'networkidle2',
      });
      this.logger.debug('IMCE page loaded');

      // Wait for the IMCE iframe to load
      this.logger.debug('Waiting for IMCE iframe to load');
      const imceFrame = await page.waitForSelector('iframe[src*="imce"]', {
        timeout: 10000,
      });
      if (!imceFrame) {
        this.logger.error('IMCE iframe not found');
        throw new Error('IMCE iframe not found');
      }
      this.logger.debug('IMCE iframe found, getting content frame');
      const frame = await imceFrame.contentFrame();

      // Trigger Antibot
      onLog?.('I am really not a bot...');
      await page.mouse.move(100, 100);
      await page.keyboard.press('Tab');

      // Select "members" folder
      this.logger.debug('Looking for members folder');
      onLog?.('Selecting "members" folder...');

      // Handle any alert dialogs that might appear when selecting the folder
      page.on('dialog', async (dialog) => {
        this.logger.debug(`Dialog appeared: ${dialog.message()}`);
        await dialog.dismiss();
      });

      // Click the specific anchor for "members"
      // The selector looks for an <a> with title="members" inside the tree
      const membersFolderSelector = 'a.folder[title="members"]';
      await frame.waitForSelector(membersFolderSelector, {
        timeout: 50000, // 5s timeout to find the folder
      });
      this.logger.debug('Members folder selector found, clicking...');
      await frame.click(membersFolderSelector);
      this.logger.debug('Members folder clicked');

      // Wait for file list to populate (> 50 items sanity check)
      this.logger.debug('Waiting for file list to load...');
      onLog?.('Waiting for file list to load...');
      await frame.waitForFunction(
        () => {
          const rows = document.querySelectorAll(
            '#file-list > tbody:nth-child(1) tr',
          );
          return rows.length > 50;
        },
        { timeout: 10000 },
      );
      this.logger.debug('File list loaded');

      // Open Upload Tab (Click "Upload" in toolbar)
      // We do this once, as the panel stays open
      this.logger.debug('Opening upload tab');
      const uploadTabSelector = '#op-item-upload a[name=upload]';
      if (await frame.$(uploadTabSelector)) {
        await frame.click(uploadTabSelector);
        // Wait for the form to be visible
        await frame.waitForSelector('#op-content-upload', { visible: true });
        this.logger.debug('Upload tab opened');
      } else {
        this.logger.debug('Upload tab selector not found, may already be open');
      }

      // Process Files Loop
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          this.logger.debug(
            `Uploading file ${i + 1}/${files.length}: ${file.originalname}`,
          );
          onLog?.(`Uploading ${file.originalname}...`);
          await this.uploadSingleFile(frame, file.path, file.originalname);
          results.push({ filename: file.originalname, status: 'success' });
          this.logger.debug(`File uploaded successfully: ${file.originalname}`);
          onLog?.(`✅ Uploaded: ${file.originalname}`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.logger.debug(
            `File upload failed: ${file.originalname} - ${errorMessage}`,
          );
          this.logger.error(`Failed to upload ${file.originalname}`, err);
          results.push({ filename: file.originalname, status: 'error' });
          onLog?.(`❌ Failed: ${file.originalname}`);
        }
      }
      this.logger.debug(
        `Upload complete: ${results.filter((r) => r.status === 'success').length}/${results.length} successful`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.debug(`Critical upload error: ${errorMessage}`);
      this.logger.error('Critical upload error', error);
      throw error;
    } finally {
      if (browser) {
        this.logger.debug('Closing browser');
        await browser.close();
      }
    }

    return results;
  }

  private async uploadSingleFile(
    frame: Frame,
    filePath: string,
    originalName: string,
  ) {
    this.logger.debug(`uploadSingleFile: ${originalName} from ${filePath}`);

    // Attach file to input
    const fileInputSelector = '#edit-imce';
    this.logger.debug(`Waiting for file input selector: ${fileInputSelector}`);
    const fileInput = (await frame.waitForSelector(
      fileInputSelector,
    )) as ElementHandle<HTMLInputElement>;
    if (!fileInput) {
      this.logger.error('File input element not found');
      throw new Error('File input not found');
    }
    this.logger.debug('File input found, uploading file');

    // Clear previous input if needed (usually strictly not needed if we submit, but good practice)
    await fileInput.uploadFile(filePath);
    this.logger.debug('File attached to input');

    // Click Upload/Submit
    const submitBtnSelector = '#edit-upload';
    this.logger.debug(`Clicking submit button: ${submitBtnSelector}`);
    await frame.click(submitBtnSelector);
    this.logger.debug('Submit button clicked');

    // Wait for success signal
    // The user noticed that <div id="file-preview">...<img src="...name...">...</div> appears
    // We wait for the file preview to appear AND contain our filename
    this.logger.debug(
      `Waiting for file preview to appear with name: ${originalName}`,
    );
    await frame.waitForFunction(
      (name) => {
        const preview = document.querySelector('#file-preview');
        const img = preview?.querySelector('img');
        return img?.src.includes(name);
      },
      { timeout: 15000 }, // 15s timeout for upload
      originalName,
    );
    this.logger.debug(`File preview confirmed for: ${originalName}`);
  }

  /**
   * Helper to convert "key=value; key2=value2" string into Puppeteer cookie objects
   */
  private parseCookieString(cookieString: string, domain: string) {
    return cookieString.split('; ').map((part) => {
      const [name, ...rest] = part.split('=');
      return {
        name,
        value: rest.join('='),
        domain,
        path: '/',
      };
    });
  }
}

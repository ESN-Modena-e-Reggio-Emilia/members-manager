import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer, {
  Browser,
  Dialog,
  ElementHandle,
  Frame,
  Page,
} from 'puppeteer';
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
    let browser: Browser | null = null;

    try {
      this.logger.debug(`Starting upload for ${files.length} files`);

      // Open the IMCE "members" folder. Any dialog that appears (e.g. while
      // selecting the folder) is simply dismissed during uploads.
      const session = await this.openImceMembersFrame(onLog, (dialog) => {
        this.logger.debug(`Dialog appeared (dismissing): ${dialog.message()}`);
        return dialog.dismiss();
      });
      browser = session.browser;
      const { frame } = session;

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

  /**
   * Deletes existing images from the IMCE "members" folder.
   *
   * For each filename it: selects the matching row, verifies the file is
   * actually selected (the #file-preview must contain an <img>), clicks the
   * delete button and accepts the "Delete selected files?" confirm dialog.
   */
  async deleteImages(
    filenames: Array<string>,
    onLog?: (msg: string) => void,
  ): Promise<{ filename: string; status: 'success' | 'error' }[]> {
    const results: { filename: string; status: 'success' | 'error' }[] = [];
    let browser: Browser | null = null;

    try {
      this.logger.debug(`Starting delete for ${filenames.length} files`);

      // Accept the delete-confirmation dialog ("Delete selected files?"),
      // but dismiss any other dialog (e.g. stray alerts on folder select).
      const session = await this.openImceMembersFrame(onLog, (dialog) => {
        const message = dialog.message().toLowerCase();
        if (message.includes('delete')) {
          this.logger.debug(`Dialog appeared (accepting): ${dialog.message()}`);
          return dialog.accept();
        }
        this.logger.debug(`Dialog appeared (dismissing): ${dialog.message()}`);
        return dialog.dismiss();
      });
      browser = session.browser;
      const { frame } = session;

      for (let i = 0; i < filenames.length; i++) {
        const filename = filenames[i];
        try {
          this.logger.debug(
            `Deleting file ${i + 1}/${filenames.length}: ${filename}`,
          );
          onLog?.(`Deleting ${filename}...`);
          await this.deleteSingleFile(frame, filename);
          results.push({ filename, status: 'success' });
          this.logger.debug(`File deleted successfully: ${filename}`);
          onLog?.(`✅ Deleted: ${filename}`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.logger.debug(
            `File delete failed: ${filename} - ${errorMessage}`,
          );
          this.logger.error(`Failed to delete ${filename}`, err);
          results.push({ filename, status: 'error' });
          onLog?.(`❌ Failed: ${filename} (${errorMessage})`);
        }
      }
      this.logger.debug(
        `Delete complete: ${results.filter((r) => r.status === 'success').length}/${results.length} successful`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.debug(`Critical delete error: ${errorMessage}`);
      this.logger.error('Critical delete error', error);
      throw error;
    } finally {
      if (browser) {
        this.logger.debug('Closing browser');
        await browser.close();
      }
    }

    return results;
  }

  /**
   * Replaces existing images: for each file it deletes any existing file with
   * the same name (Drupal refuses to overwrite and would otherwise save a
   * "_0" suffixed copy), then uploads the new file under the now-free name.
   *
   * Runs everything in a single browser session. If no existing file is found,
   * the delete step is skipped and the upload proceeds as a fresh upload.
   */
  async replaceImages(
    files: Array<UploadableFile>,
    onLog?: (msg: string) => void,
  ): Promise<{ filename: string; status: 'success' | 'error' }[]> {
    const results: { filename: string; status: 'success' | 'error' }[] = [];
    let browser: Browser | null = null;

    try {
      this.logger.debug(`Starting replace for ${files.length} files`);

      // Same dialog policy as delete: accept the "Delete selected files?"
      // confirm, dismiss anything else.
      const session = await this.openImceMembersFrame(onLog, (dialog) => {
        const message = dialog.message().toLowerCase();
        if (message.includes('delete')) {
          this.logger.debug(`Dialog appeared (accepting): ${dialog.message()}`);
          return dialog.accept();
        }
        this.logger.debug(`Dialog appeared (dismissing): ${dialog.message()}`);
        return dialog.dismiss();
      });
      browser = session.browser;
      const { frame } = session;

      // Open the Upload tab once; it coexists with the file list/delete button.
      this.logger.debug('Opening upload tab');
      const uploadTabSelector = '#op-item-upload a[name=upload]';
      if (await frame.$(uploadTabSelector)) {
        await frame.click(uploadTabSelector);
        await frame.waitForSelector('#op-content-upload', { visible: true });
        this.logger.debug('Upload tab opened');
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          this.logger.debug(
            `Replacing file ${i + 1}/${files.length}: ${file.originalname}`,
          );

          // Delete existing copy if present. A "not found" is expected for new
          // members and must not abort the upload.
          try {
            onLog?.(`Removing existing ${file.originalname}...`);
            await this.deleteSingleFile(frame, file.originalname);
            onLog?.(`🗑️  Removed old: ${file.originalname}`);
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            if (errorMessage.includes('not found')) {
              this.logger.debug(
                `No existing file to delete for ${file.originalname}, uploading fresh`,
              );
              onLog?.(`No existing ${file.originalname}, uploading fresh...`);
            } else {
              throw err;
            }
          }

          onLog?.(`Uploading ${file.originalname}...`);
          await this.uploadSingleFile(frame, file.path, file.originalname);
          results.push({ filename: file.originalname, status: 'success' });
          this.logger.debug(`File replaced successfully: ${file.originalname}`);
          onLog?.(`✅ Replaced: ${file.originalname}`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.logger.debug(
            `File replace failed: ${file.originalname} - ${errorMessage}`,
          );
          this.logger.error(`Failed to replace ${file.originalname}`, err);
          results.push({ filename: file.originalname, status: 'error' });
          onLog?.(`❌ Failed: ${file.originalname} (${errorMessage})`);
        }
      }
      this.logger.debug(
        `Replace complete: ${results.filter((r) => r.status === 'success').length}/${results.length} successful`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.debug(`Critical replace error: ${errorMessage}`);
      this.logger.error('Critical replace error', error);
      throw error;
    } finally {
      if (browser) {
        this.logger.debug('Closing browser');
        await browser.close();
      }
    }

    return results;
  }

  private async deleteSingleFile(frame: Frame, filename: string) {
    this.logger.debug(`deleteSingleFile: ${filename}`);

    // Select the row by matching the filename text. We can't rely on a CSS id
    // selector because the row ids contain dots (e.g. "alessandro_amella.jpeg")
    // which are interpreted as class separators.
    //
    // We dispatch the full mouse-event sequence (mousedown → mouseup → click)
    // IN-PAGE on the name cell rather than using Puppeteer's mouse:
    //   - in-page dispatch needs no iframe coordinate mapping (a real click
    //     into the iframe only "hovered" the row — coords drifted off target),
    //   - IMCE binds selection on mousedown, which a plain .click() never fires.
    this.logger.debug(`Selecting row for: ${filename}`);
    const rowFound = await frame.evaluate((name) => {
      const rows = document.querySelectorAll('#file-list tbody tr');
      let target: Element | null = null;
      for (const row of Array.from(rows)) {
        if (row.querySelector('td.name span')?.textContent?.trim() === name) {
          target = row.querySelector('td.name') ?? row;
          break;
        }
      }
      if (!target) return false;
      target.scrollIntoView({ block: 'center' });
      for (const type of ['mousedown', 'mouseup', 'click']) {
        target.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
          }),
        );
      }
      return true;
    }, filename);

    if (!rowFound) {
      throw new Error(`File "${filename}" not found in the members folder`);
    }

    // Confirm the file is really selected: the preview must contain an <img>
    // whose src points to this file. If it never appears, abort instead of
    // risking the deletion of whatever else might be selected.
    this.logger.debug(`Waiting for preview to confirm selection: ${filename}`);
    try {
      await frame.waitForFunction(
        (name) => {
          const preview = document.querySelector('#file-preview');
          const img = preview?.querySelector('img');
          return !!img && img.src.includes(name);
        },
        { timeout: 10000 },
        filename,
      );
    } catch {
      throw new Error(
        `Preview did not load for "${filename}" — file not selected, aborting delete`,
      );
    }
    this.logger.debug(`Selection confirmed for: ${filename}`);

    // Click the delete button. The confirm dialog is auto-accepted by the
    // dialog handler registered in deleteImages().
    const deleteBtnSelector = '#op-item-delete > a:nth-child(1)';
    this.logger.debug(`Clicking delete button: ${deleteBtnSelector}`);
    await frame.click(deleteBtnSelector);
    this.logger.debug('Delete button clicked, waiting for row removal');

    // Wait for the row to disappear from the list, confirming the delete.
    await frame.waitForFunction(
      (name) => {
        const rows = document.querySelectorAll('#file-list tbody tr');
        return !Array.from(rows).some(
          (row) =>
            row.querySelector('td.name span')?.textContent?.trim() === name,
        );
      },
      { timeout: 15000 },
      filename,
    );
    this.logger.debug(`Row removed, delete confirmed for: ${filename}`);
  }

  /**
   * Launches a browser, restores the Drupal session, opens the IMCE file
   * manager and selects the "members" folder. Returns the live browser, page
   * and the IMCE iframe's content frame. Callers own the browser's lifecycle
   * (i.e. must close it) and register their own dialog handler behaviour.
   */
  private async openImceMembersFrame(
    onLog: ((msg: string) => void) | undefined,
    onDialog: (dialog: Dialog) => Promise<void>,
  ): Promise<{ browser: Browser; page: Page; frame: Frame }> {
    onLog?.('Initializing browser...');

    // Get the Session Cookie String
    const cookieString = await this.authService.getSessionCookie(onLog);
    this.logger.debug('Session cookie obtained');

    // Launch Browser
    this.logger.debug(
      `Launching browser (headless: ${this.configService.get('NODE_ENV') !== 'development'})`,
    );
    const browser = await puppeteer.launch({
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

    // Register the caller-provided dialog handler before any navigation/clicks
    page.on('dialog', (dialog) => {
      void onDialog(dialog);
    });

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
    if (!frame) {
      this.logger.error('IMCE content frame not available');
      throw new Error('IMCE content frame not available');
    }

    // Trigger Antibot
    onLog?.('I am really not a bot...');
    await page.mouse.move(100, 100);
    await page.keyboard.press('Tab');

    // Select "members" folder
    this.logger.debug('Looking for members folder');
    onLog?.('Selecting "members" folder...');

    // Click the specific anchor for "members"
    // The selector looks for an <a> with title="members" inside the tree
    const membersFolderSelector = 'a.folder[title="members"]';
    await frame.waitForSelector(membersFolderSelector, {
      timeout: 50000,
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

    return { browser, page, frame };
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

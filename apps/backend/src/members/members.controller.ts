import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  Body,
  Controller,
  Get,
  Logger,
  MessageEvent,
  Param,
  Post,
  Sse,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Observable, Subject } from 'rxjs';
import { CacheService } from '../cache/cache.service';
import { DrupalContentService } from '../drupal/drupal-content.service';
import { DrupalImageService } from '../drupal/drupal-image.service';
import { MemberData } from './esn-page-manager';
import { MembersService } from './members.service';

// Short-lived storage for a prepared publish payload (the large newHtml can't
// travel in an EventSource GET, so we stash it and stream by job id).
const PUBLISH_JOB_TTL = 5 * 60 * 1000; // 5 minutes

// Assicuriamoci che la cartella esista all'avvio del file (opzionale ma utile)
const uploadDir = './uploads';
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir);
}

// Multer config for images
const storage = diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    // Keep original name for consistency with Drupal upload logic
    cb(null, file.originalname);
  },
});

@Controller('members')
export class MembersController {
  private readonly logger = new Logger(MembersController.name);

  constructor(
    private readonly membersService: MembersService,
    private readonly drupalService: DrupalContentService,
    private readonly drupalImageService: DrupalImageService,
    private readonly cacheService: CacheService,
  ) {}

  // Stores the prepared HTML and returns a job id to stream the publish from.
  @Post('prepare-publish')
  async preparePublish(@Body() body: { newHtml: string }) {
    if (!body?.newHtml) {
      return { error: 'newHtml is required' };
    }
    const jobId = randomUUID();
    await this.cacheService.set(
      `publish_job:${jobId}`,
      body.newHtml,
      PUBLISH_JOB_TTL,
    );
    return { jobId };
  }

  // Streams the full publish pipeline (drift snapshot -> Drupal save -> GitHub
  // commit) as SSE log/done/error events, same shape as DrupalController.
  @Sse('publish/:jobId')
  publish(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    void (async () => {
      try {
        const newHtml = await this.cacheService.get<string>(
          `publish_job:${jobId}`,
        );
        if (!newHtml) {
          subject.next({
            data: {
              type: 'error',
              message:
                'Sessione di pubblicazione scaduta o non trovata. Riprova.',
            },
          });
          subject.complete();
          return;
        }

        const result = await this.membersService.publishAndBackup(
          newHtml,
          (msg) => subject.next({ data: { type: 'log', message: msg } }),
        );

        await this.cacheService.delete(`publish_job:${jobId}`);
        subject.next({ data: { type: 'done', result } });
        subject.complete();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`Publish failed: ${message}`);
        subject.next({ data: { type: 'error', message } });
        subject.complete();
      }
    })();

    return subject.asObservable();
  }

  // 1. Scrape Drupal -> Parse -> Return JSON
  @Get()
  async getCurrentMembers() {
    // Fetch HTML from Drupal (using your existing Puppeteer logic)
    const html = await this.drupalService.getAboutUsContent();

    // Parse to JSON
    return this.membersService.parseHtmlToJson(html);
  }

  // UPDATED: Now returns detailed diff info
  @Post()
  async previewHtml(@Body() newState: Record<string, MemberData[]>) {
    // 1. Fetch Original
    const oldHtml = await this.drupalService.getAboutUsContent();

    // 2. Generate New
    const newHtml = this.membersService.generateHtmlFromJson(oldHtml, newState);

    // 3. Calculate Image Diff
    // Extract all filenames from the newState (frontend state)
    const newImageSet = new Set<string>();
    Object.values(newState)
      .flat()
      .forEach((m) => {
        if (m.imageFilename) newImageSet.add(m.imageFilename);
      });

    // Extract all filenames from the oldHtml (Drupal state)
    // We reuse the parser logic quickly here or regex it
    const oldJson = this.membersService.parseHtmlToJson(oldHtml);
    const oldImageSet = new Set<string>();
    Object.values(oldJson)
      .flat()
      .forEach((m) => {
        if (m.imageFilename) oldImageSet.add(m.imageFilename);
      });

    // Calculate Diff
    const toUpload = [...newImageSet].filter((x) => !oldImageSet.has(x));
    const toDelete = [...oldImageSet].filter((x) => !newImageSet.has(x));

    return {
      success: true,
      oldHtml,
      newHtml,
      images: {
        toUpload,
        toDelete,
        totalNew: newImageSet.size,
        totalOld: oldImageSet.size,
      },
    };
  }

  // NEW: Triggers the Puppeteer upload for specific files
  @Post('deploy-images')
  async deployImages(@Body() body: { filenames: string[] }) {
    const { filenames } = body;
    if (!filenames || filenames.length === 0)
      return { message: 'No files to upload' };

    // Construct file objects pointing to the local disk
    const filesToUpload = filenames.map((name) => ({
      originalname: name,
      path: join(process.cwd(), 'uploads', name),
    }));

    // Reuse the logic!
    const results = await this.drupalImageService.uploadImages(
      filesToUpload,
      (msg) => {
        this.logger.log(`[Deploy] ${msg}`);
      },
    );

    return { results };
  }

  // Triggers the Puppeteer delete for specific files in the members folder
  @Post('delete-images')
  async deleteImages(@Body() body: { filenames: string[] }) {
    const { filenames } = body;
    if (!filenames || filenames.length === 0)
      return { message: 'No files to delete' };

    const results = await this.drupalImageService.deleteImages(
      filenames,
      (msg) => {
        this.logger.log(`[Delete] ${msg}`);
      },
    );

    return { results };
  }

  // Deletes the existing copy (if any) then re-uploads, in one browser session.
  // Files are read from the local uploads/ dir, like deploy-images.
  @Post('replace-images')
  async replaceImages(@Body() body: { filenames: string[] }) {
    const { filenames } = body;
    if (!filenames || filenames.length === 0)
      return { message: 'No files to replace' };

    const filesToReplace = filenames.map((name) => ({
      originalname: name,
      path: join(process.cwd(), 'uploads', name),
    }));

    const results = await this.drupalImageService.replaceImages(
      filesToReplace,
      (msg) => {
        this.logger.log(`[Replace] ${msg}`);
      },
    );

    return { results };
  }

  // 3. Image Upload
  @Post('upload')
  @UseInterceptors(FilesInterceptor('photos', 10, { storage })) // Allow up to 10 files
  async uploadFiles(@UploadedFiles() files: Array<Express.Multer.File>) {
    if (!files || files.length === 0) {
      return { message: 'No files provided' };
    }

    // Call the puppeteer service
    // We can define a simple log callback to see progress in console
    const results = await this.drupalImageService.uploadImages(files, (msg) => {
      this.logger.log(`[Upload Job] ${msg}`);
    });

    // Clean up: delete uploaded files after processing
    for (const file of files) {
      try {
        await unlink(file.path);
      } catch (err) {
        this.logger.warn(`Failed to delete ${file.path}:`, err);
      }
    }

    return {
      message: 'Upload process completed',
      results,
    };
  }

  // 4. Image Replace (multipart): deletes any existing copy then re-uploads.
  // Safe to use for new files too — the delete step is skipped if none exists,
  // so this avoids Drupal's "_0" suffix on same-name re-uploads.
  @Post('replace')
  @UseInterceptors(FilesInterceptor('photos', 10, { storage }))
  async replaceFiles(@UploadedFiles() files: Array<Express.Multer.File>) {
    if (!files || files.length === 0) {
      return { message: 'No files provided' };
    }

    const results = await this.drupalImageService.replaceImages(
      files,
      (msg) => {
        this.logger.log(`[Replace Job] ${msg}`);
      },
    );

    // Clean up: delete uploaded files after processing
    for (const file of files) {
      try {
        await unlink(file.path);
      } catch (err) {
        this.logger.warn(`Failed to delete ${file.path}:`, err);
      }
    }

    return {
      message: 'Replace process completed',
      results,
    };
  }
}

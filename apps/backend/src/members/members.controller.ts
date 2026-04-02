import { existsSync, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { DrupalContentService } from '../drupal/drupal-content.service';
import { DrupalImageService } from '../drupal/drupal-image.service';
import { MemberData } from './esn-page-manager';
import { MembersService } from './members.service';

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
  ) {}

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
}

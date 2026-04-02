import { Controller, Delete, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

@Controller('cache')
export class CacheController {
  private readonly logger = new Logger(CacheController.name);

  constructor(private readonly cacheService: CacheService) {}

  @Delete('content')
  async clearContentCache() {
    this.logger.log(
      'Svuotamento manuale della cache dei contenuti HTML richiesto...',
    );
    // La chiave esatta usata in DrupalContentService
    await this.cacheService.delete('drupal_about_us_content');
    return { success: true, message: 'Cache svuotata con successo' };
  }
}

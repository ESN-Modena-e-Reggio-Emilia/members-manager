import { Inject, Injectable, Logger } from '@nestjs/common';
import { Keyv } from 'keyv';
import { CACHE_INSTANCE } from './cache.constants';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly prefix = 'about-us-editor:';

  constructor(@Inject(CACHE_INSTANCE) private readonly cache: Keyv) {}

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.prefix + key;
    const result = await this.cache.get(fullKey);
    if (result !== undefined) {
      this.logger.debug(`Cache hit for key: ${key}`);
    } else {
      this.logger.debug(`Cache miss for key: ${key}`);
    }
    return (result as T) ?? null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    this.logger.debug(
      `Setting cache for key: ${key}${ttl ? ` (TTL: ${ttl}ms)` : ''}`,
    );
    await this.cache.set(this.prefix + key, value, ttl);
  }

  async delete(key: string): Promise<void> {
    this.logger.debug(`Deleting cache for key: ${key}`);
    await this.cache.delete(this.prefix + key);
  }
}

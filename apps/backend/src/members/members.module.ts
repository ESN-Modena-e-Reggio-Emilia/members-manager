import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { DrupalModule } from '../drupal/drupal.module';
import { GithubModule } from '../github/github.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  providers: [MembersService],
  controllers: [MembersController],
  imports: [DrupalModule, GithubModule, CacheModule],
})
export class MembersModule {}

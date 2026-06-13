import { Module } from '@nestjs/common';
import { DrupalModule } from 'src/drupal/drupal.module';
import { GithubModule } from 'src/github/github.module';
import { CacheModule } from '../cache/cache.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  providers: [MembersService],
  controllers: [MembersController],
  imports: [DrupalModule, GithubModule, CacheModule],
})
export class MembersModule {}

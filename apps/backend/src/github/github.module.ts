import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { GithubService } from './github.service';

@Module({
  imports: [HttpModule],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}

import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheModule } from './cache/cache.module';
import { DrupalModule } from './drupal/drupal.module';
import { GithubModule } from './github/github.module';
import { MembersModule } from './members/members.module';

@Module({
  imports: [
    DrupalModule,
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'), // Serve files from /public
      // renderPath: '/*path',
      exclude: ['/v1{/*path}'], // Don't block API routes (note: new syntax for wildcard)
    }),
    MembersModule,
    CacheModule,
    GithubModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

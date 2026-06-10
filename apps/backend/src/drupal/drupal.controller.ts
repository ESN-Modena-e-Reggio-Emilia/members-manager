import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { DrupalAuthService } from './drupal-auth.service';
import { DrupalContentService } from './drupal-content.service';

@Controller('drupal')
export class DrupalController {
  constructor(
    private readonly drupalContentService: DrupalContentService,
    private readonly drupalAuthService: DrupalAuthService,
  ) {}

  @Sse('clear-cache')
  clearCache(): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    void (async () => {
      try {
        await this.drupalAuthService.clearDrupalSiteCache((msg) => {
          subject.next({ data: { type: 'log', message: msg } });
        });

        subject.next({ data: { type: 'done' } });
        subject.complete();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        subject.next({ data: { type: 'error', message: errorMessage } });
        subject.complete();
      }
    })();

    return subject.asObservable();
  }

  @Sse('stream-about-us')
  streamAboutUs(): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    // We trigger the async process immediately
    // but don't "await" it here because we need to return the observable
    void (async () => {
      try {
        const result = await this.drupalContentService.getAboutUsContent(
          (msg) => {
            // Send a "log" event
            subject.next({ data: { type: 'log', message: msg } });
          },
        );

        // Send the final result
        subject.next({ data: { type: 'result', content: result } });

        // Complete the stream
        subject.complete();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        subject.next({ data: { type: 'error', message: errorMessage } });
        subject.complete();
      }
    })();

    return subject.asObservable();
  }
}

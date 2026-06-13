import { Injectable, Logger } from '@nestjs/common';
import { DrupalContentService } from '../drupal/drupal-content.service';
import { DrupalPublishService } from '../drupal/drupal-publish.service';
import { GithubService } from '../github/github.service';
import { ESNPageManager, MemberData, SectionType } from './esn-page-manager';

export interface PublishResult {
  verified: boolean;
  // True only when the repo ALREADY had a backup and the live Drupal content
  // differed from it — i.e. a genuine out-of-band manual edit.
  driftDetected: boolean;
  // True when the repo had no backup yet (first ever publish) — not a drift.
  firstBackup: boolean;
  commitSha: string | null;
}

function normalize(html: string): string {
  return html.replace(/\r\n/g, '\n').trim();
}

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly contentService: DrupalContentService,
    private readonly publishService: DrupalPublishService,
    private readonly githubService: GithubService,
  ) {}

  /**
   * Full GitOps publish pipeline:
   *  1. fetch the LIVE Drupal HTML (bypassing cache);
   *  2. if it drifted from the repo HEAD, commit it first as a backup snapshot
   *     so out-of-band Drupal edits are never silently lost;
   *  3. publish the new HTML to Drupal (with its own re-read verification);
   *  4. commit the new HTML to the repo as the new source of truth.
   * If step 3 fails, step 4 is skipped — the drift snapshot already protects
   * the prior state.
   */
  async publishAndBackup(
    newHtml: string,
    onLog?: (msg: string) => void,
  ): Promise<PublishResult> {
    // 1. Live Drupal state (no cache).
    onLog?.('Reading the current live content from Drupal...');
    const liveHtml = await this.contentService.getAboutUsContentFresh(onLog);

    // 2. Drift snapshot: capture out-of-band edits before we overwrite them.
    onLog?.('Checking GitHub for out-of-band changes (drift)...');
    const repoHead = await this.githubService.getHeadContent();
    const firstBackup = repoHead === null;
    const driftDetected =
      !firstBackup && normalize(repoHead) !== normalize(liveHtml);

    if (firstBackup) {
      onLog?.('No backup in the repo yet — creating the first snapshot.');
      await this.githubService.commitFile(
        liveHtml,
        `chore(backup): initial snapshot of live Drupal content ${new Date().toISOString()}`,
        undefined,
        onLog,
      );
    } else if (driftDetected) {
      onLog?.('Drift detected — snapshotting the live Drupal content first.');
      await this.githubService.commitFile(
        liveHtml,
        `chore(drift): snapshot out-of-band Drupal edits before publish ${new Date().toISOString()}`,
        undefined,
        onLog,
      );
    } else {
      onLog?.('No drift — the repo is in sync with Drupal.');
    }

    // 3. Publish to Drupal (throws on verification failure — we stop here).
    onLog?.('Publishing the new content to Drupal...');
    await this.publishService.publishAboutUs(newHtml, onLog);

    // 4. Record the new source of truth in GitHub.
    onLog?.('Recording the new version in GitHub...');
    const { commitSha } = await this.githubService.commitFile(
      newHtml,
      `feat(about-us): publish member changes ${new Date().toISOString()}`,
      undefined,
      onLog,
    );

    onLog?.('Done — published to Drupal and backed up to GitHub.');
    return { verified: true, driftDetected, firstBackup, commitSha };
  }

  parseHtmlToJson(html: string): Record<string, MemberData[]> {
    this.logger.debug(`Parsing HTML to JSON (length: ${html.length})`);
    const manager = new ESNPageManager(html, this.logger);
    const result = manager.getJsonState();
    this.logger.debug(
      `Parsed JSON with sections: ${Object.keys(result).join(', ')}`,
    );
    return result;
  }

  generateHtmlFromJson(
    originalHtml: string,
    newState: Record<string, MemberData[]>,
  ): string {
    this.logger.debug(
      `Generating HTML from JSON (sections: ${Object.keys(newState).join(', ')})`,
    );
    const manager = new ESNPageManager(originalHtml, this.logger);
    const sectionKeys = Object.keys(newState); // cast to SectionType

    for (const key of sectionKeys) {
      this.logger.debug(
        `Updating section "${key}" with ${newState[key].length} items`,
      );
      manager.updateSectionFromList(key as SectionType, newState[key]);
    }
    const output = manager.getOutput();
    this.logger.debug(`Generated HTML output (length: ${output.length})`);
    return output;
  }
}

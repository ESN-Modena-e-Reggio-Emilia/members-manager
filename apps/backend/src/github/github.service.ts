import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

interface RepoFile {
  sha: string;
  content: string;
}

/**
 * Commits the about-us HTML to a private GitHub repo via the Contents REST API
 * (no local clone needed — just a PAT). Acts as backup + source of truth,
 * replacing the old manual backup download.
 */
@Injectable()
export class GithubService implements OnModuleInit {
  private readonly logger = new Logger(GithubService.name);
  private readonly apiBase = 'https://api.github.com';

  private token!: string;
  private owner!: string;
  private repo!: string;
  private branch!: string;
  private authorName!: string;
  private authorEmail!: string;
  private filePath!: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const token = this.configService.get<string>('GITHUB_TOKEN');
    const repo = this.configService.get<string>('GITHUB_REPO');
    const authorName = this.configService.get<string>(
      'GITHUB_COMMIT_AUTHOR_NAME',
    );
    const authorEmail = this.configService.get<string>(
      'GITHUB_COMMIT_AUTHOR_EMAIL',
    );

    if (!token || !repo || !authorName || !authorEmail) {
      throw new Error(
        'GITHUB_TOKEN, GITHUB_REPO, GITHUB_COMMIT_AUTHOR_NAME and ' +
          'GITHUB_COMMIT_AUTHOR_EMAIL environment variables must be set',
      );
    }

    const [owner, name] = repo.split('/');
    if (!owner || !name) {
      throw new Error('GITHUB_REPO must be in the form "owner/name"');
    }

    this.token = token;
    this.owner = owner;
    this.repo = name;
    this.branch = this.configService.get<string>('GITHUB_BRANCH') || 'main';
    this.authorName = authorName;
    this.authorEmail = authorEmail;
    this.filePath =
      this.configService.get<string>('GITHUB_FILE_PATH') || 'about-us.html';

    this.logger.log(
      `GitHub backup configured: ${this.owner}/${this.repo}@${this.branch} -> ${this.filePath}`,
    );
  }

  /** The repo path the about-us HTML is committed to (e.g. about-us.html). */
  get path(): string {
    return this.filePath;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'esn-about-us-editor',
    };
  }

  private contentsUrl(path: string): string {
    return `${this.apiBase}/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
  }

  /**
   * Fetches a file's content and blob SHA from the repo. Returns null if the
   * file does not exist yet (first run).
   */
  async getFile(path = this.filePath): Promise<RepoFile | null> {
    try {
      const res = await firstValueFrom(
        this.httpService.get(this.contentsUrl(path), {
          headers: this.headers,
          params: { ref: this.branch },
        }),
      );
      const data = res.data as { sha: string; content: string };
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      return { sha: data.sha, content };
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /** Convenience: just the current HEAD content of the tracked file (or null). */
  async getHeadContent(path = this.filePath): Promise<string | null> {
    const file = await this.getFile(path);
    return file?.content ?? null;
  }

  /**
   * Creates or updates a file in the repo with a commit. Skips the request if
   * the content is byte-identical to the current HEAD (GitHub rejects empty
   * diffs). Retries once on a 409 stale-SHA conflict.
   */
  async commitFile(
    content: string,
    message: string,
    path = this.filePath,
    onLog?: (msg: string) => void,
  ): Promise<{ commitSha: string | null; skipped: boolean }> {
    const existing = await this.getFile(path);

    if (existing && existing.content === content) {
      onLog?.(`No changes for ${path}, skipping commit.`);
      return { commitSha: null, skipped: true };
    }

    const put = async (sha?: string) => {
      const res = await firstValueFrom(
        this.httpService.put(
          this.contentsUrl(path),
          {
            message,
            content: Buffer.from(content, 'utf-8').toString('base64'),
            branch: this.branch,
            ...(sha ? { sha } : {}),
            committer: { name: this.authorName, email: this.authorEmail },
            author: { name: this.authorName, email: this.authorEmail },
          },
          { headers: this.headers },
        ),
      );
      return (res.data as { commit: { sha: string } }).commit.sha;
    };

    onLog?.(`Committing ${path} to GitHub...`);
    try {
      const commitSha = await put(existing?.sha);
      onLog?.(`Committed ${path} (${commitSha.slice(0, 7)}).`);
      return { commitSha, skipped: false };
    } catch (error) {
      // 409: someone else committed between our read and write — refresh & retry once.
      if (error instanceof AxiosError && error.response?.status === 409) {
        onLog?.('SHA conflict, refreshing and retrying once...');
        const refreshed = await this.getFile(path);
        const commitSha = await put(refreshed?.sha);
        onLog?.(`Committed ${path} on retry (${commitSha.slice(0, 7)}).`);
        return { commitSha, skipped: false };
      }
      throw error;
    }
  }
}

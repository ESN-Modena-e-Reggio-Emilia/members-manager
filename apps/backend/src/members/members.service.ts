import { Injectable, Logger } from '@nestjs/common';
import { ESNPageManager, MemberData, SectionType } from './esn-page-manager';

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

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

import { Injectable, Logger } from '@nestjs/common';
import { chromium, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class TikTokWebService {
  private readonly logger = new Logger(TikTokWebService.name);
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initTikTok(): Promise<{ context: BrowserContext; page: Page }> {
    const profileDir = path.resolve(process.cwd(), 'data/profiles/tiktok_profile');
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    this.logger.log('Lanzando TikTok Messages con perfil persistente...');

    this.context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: ['--disable-blink-features=AutomationControlled'],
      viewport: { width: 1366, height: 768 }
    });

    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
    await this.page.goto('https://www.tiktok.com/messages', { waitUntil: 'domcontentloaded', timeout: 35000 });
    return { context: this.context, page: this.page };
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }
  }
}

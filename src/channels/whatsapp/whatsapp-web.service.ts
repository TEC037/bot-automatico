import { Injectable, Logger } from '@nestjs/common';
import { chromium, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class WhatsAppWebService {
  private readonly logger = new Logger(WhatsAppWebService.name);
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initWhatsApp(): Promise<{ context: BrowserContext; page: Page }> {
    const profileDir = path.resolve(process.cwd(), 'data/profiles/whatsapp_profile');
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    this.logger.log('Lanzando WhatsApp Web con perfil persistente...');

    try {
      this.context = await chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        headless: false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox'
        ],
        viewport: { width: 1366, height: 768 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      });
    } catch {
      this.context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        viewport: { width: 1366, height: 768 }
      });
    }

    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

    await this.page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
    return { context: this.context, page: this.page };
  }

  getPage(): Page | null {
    return this.page;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }
  }
}

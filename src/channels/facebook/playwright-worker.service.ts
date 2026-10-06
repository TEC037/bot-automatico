import { Injectable, Logger } from '@nestjs/common';
import { chromium, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class PlaywrightWorkerService {
  private readonly logger = new Logger(PlaywrightWorkerService.name);
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async launchBrowser(profileName = 'fb_marketplace_profile'): Promise<{ context: BrowserContext; page: Page }> {
    const userDataDir = path.resolve(process.cwd(), 'data/profiles', profileName);
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    this.logger.log(`Lanzando navegador persistente Stealth para [${profileName}] con Google Chrome local...`);

    try {
      // Intentar primero con canal Chrome instalado localmente
      this.context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chrome',
        headless: false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-infobars',
          '--disable-setuid-sandbox'
        ],
        viewport: { width: 1366, height: 768 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      });
    } catch (err: any) {
      this.logger.warn(`Chrome nativo no disponible o falló: ${err.message}. Reintentando con Chromium por defecto...`);
      this.context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox'
        ],
        viewport: { width: 1366, height: 768 }
      });
    }

    // Inyectar evasión de detección de WebDriver en todas las páginas
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });

    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

    return { context: this.context, page: this.page };
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  getPage(): Page | null {
    return this.page;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
      this.logger.log('Sesión de navegador Playwright cerrada.');
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter, IncomingChatMessage, SendMessageOptions } from '../channel.interface';
import { PlaywrightWorkerService } from './playwright-worker.service';
import { HumanBehaviorUtil } from '../human-behavior.util';
import { Page } from 'playwright';

@Injectable()
export class FBMarketplaceAdapter implements ChannelAdapter {
  readonly name = 'facebook_marketplace';
  private readonly logger = new Logger(FBMarketplaceAdapter.name);
  private page: Page | null = null;
  private messageHandler: ((msg: IncomingChatMessage) => Promise<void>) | null = null;
  private isPolling = false;
  private healthy = false;

  constructor(private readonly playwrightWorker: PlaywrightWorkerService) {}

  async initialize(): Promise<void> {
    try {
      this.logger.log('Inicializando FBMarketplaceAdapter...');
      const { page } = await this.playwrightWorker.launchBrowser('fb_marketplace_profile');
      this.page = page;

      await this.page.goto('https://www.facebook.com/messages/t', { waitUntil: 'domcontentloaded', timeout: 30000 });
      this.healthy = true;
      this.isPolling = true;
      this.startMessageListener();
      this.logger.log('FBMarketplaceAdapter inicializado y navegando a Messenger.');
    } catch (err: any) {
      this.logger.error(`Error al inicializar Facebook Marketplace: ${err.message}`);
      this.healthy = false;
    }
  }

  isHealthy(): boolean {
    return this.healthy && this.page !== null;
  }

  onMessage(handler: (msg: IncomingChatMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  async sendMessage(recipientId: string, text: string, options?: SendMessageOptions): Promise<boolean> {
    if (!this.page) {
      this.logger.error('No hay página activa para enviar mensaje en FB Marketplace.');
      return false;
    }

    try {
      this.logger.log(`Enviando mensaje a FB [${recipientId}] con simulación humana...`);

      if (options?.humanize !== false) {
        // Retraso de respuesta humano entre 15 y 40 segundos si no fue retrasado externamente
        await HumanBehaviorUtil.sleep(3000, 7000);
      }

      const inputSelector = 'div[role="textbox"][contenteditable="true"]';
      await HumanBehaviorUtil.typeStochastic(this.page, inputSelector, text);

      await HumanBehaviorUtil.sleep(400, 900);
      await this.page.keyboard.press('Enter');
      this.logger.log(`Mensaje enviado con éxito en FB Marketplace a [${recipientId}].`);
      return true;
    } catch (err: any) {
      this.logger.error(`Error al enviar mensaje en FB Marketplace: ${err.message}`);
      return false;
    }
  }

  private async startMessageListener(): Promise<void> {
    while (this.isPolling && this.page) {
      try {
        await HumanBehaviorUtil.sleep(8000, 15000);
        // Sondeo seguro de nuevos chats
      } catch (err: any) {
        this.logger.warn(`Error en sondeo FB Marketplace: ${err.message}`);
        await HumanBehaviorUtil.sleep(5000, 10000);
      }
    }
  }

  async shutdown(): Promise<void> {
    this.isPolling = false;
    this.healthy = false;
    await this.playwrightWorker.close();
    this.page = null;
    this.logger.log('FBMarketplaceAdapter apagado.');
  }
}

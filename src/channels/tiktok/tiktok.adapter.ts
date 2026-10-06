import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter, IncomingChatMessage, SendMessageOptions } from '../channel.interface';
import { TikTokWebService } from './tiktok-web.service';
import { HumanBehaviorUtil } from '../human-behavior.util';
import { Page } from 'playwright';

@Injectable()
export class TikTokAdapter implements ChannelAdapter {
  readonly name = 'tiktok';
  private readonly logger = new Logger(TikTokAdapter.name);
  private page: Page | null = null;
  private messageHandler: ((msg: IncomingChatMessage) => Promise<void>) | null = null;
  private healthy = false;

  constructor(private readonly tiktokService: TikTokWebService) {}

  async initialize(): Promise<void> {
    try {
      this.logger.log('Inicializando TikTokAdapter...');
      const { page } = await this.tiktokService.initTikTok();
      this.page = page;
      this.healthy = true;
      this.logger.log('TikTokAdapter inicializado.');
    } catch (err: any) {
      this.logger.error(`Error al iniciar TikTok: ${err.message}`);
      this.healthy = false;
    }
  }

  isHealthy(): boolean {
    return this.healthy && this.page !== null;
  }

  onMessage(handler: (msg: IncomingChatMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  async sendMessage(recipientUser: string, text: string, options?: SendMessageOptions): Promise<boolean> {
    if (!this.page) {
      this.logger.error('TikTok no tiene página activa.');
      return false;
    }

    try {
      this.logger.log(`Enviando mensaje TikTok a [${recipientUser}]...`);
      const textbox = 'div[role="textbox"]';
      await HumanBehaviorUtil.typeStochastic(this.page, textbox, text);
      await HumanBehaviorUtil.sleep(300, 600);
      await this.page.keyboard.press('Enter');
      return true;
    } catch (err: any) {
      this.logger.error(`Error al enviar mensaje por TikTok: ${err.message}`);
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.healthy = false;
    await this.tiktokService.close();
    this.page = null;
    this.logger.log('TikTokAdapter detenido.');
  }

  async emitIncomingMessage(msg: IncomingChatMessage): Promise<void> {
    if (this.messageHandler) {
      await this.messageHandler(msg);
    }
  }
}

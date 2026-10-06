import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter, IncomingChatMessage, SendMessageOptions } from '../channel.interface';
import { InstagramWebService } from './instagram-web.service';
import { HumanBehaviorUtil } from '../human-behavior.util';
import { Page } from 'playwright';

@Injectable()
export class InstagramAdapter implements ChannelAdapter {
  readonly name = 'instagram';
  private readonly logger = new Logger(InstagramAdapter.name);
  private page: Page | null = null;
  private messageHandler: ((msg: IncomingChatMessage) => Promise<void>) | null = null;
  private healthy = false;

  constructor(private readonly igService: InstagramWebService) {}

  async initialize(): Promise<void> {
    try {
      this.logger.log('Inicializando InstagramAdapter...');
      const { page } = await this.igService.initInstagram();
      this.page = page;
      this.healthy = true;
      this.logger.log('InstagramAdapter inicializado.');
    } catch (err: any) {
      this.logger.error(`Error al iniciar Instagram Direct: ${err.message}`);
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
      this.logger.error('Instagram Direct no tiene página activa.');
      return false;
    }

    try {
      this.logger.log(`Enviando mensaje a Instagram [${recipientUser}]...`);
      const textbox = 'div[role="textbox"][contenteditable="true"]';
      await HumanBehaviorUtil.typeStochastic(this.page, textbox, text);
      await HumanBehaviorUtil.sleep(300, 600);
      await this.page.keyboard.press('Enter');
      return true;
    } catch (err: any) {
      this.logger.error(`Error al enviar mensaje por Instagram Direct: ${err.message}`);
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.healthy = false;
    await this.igService.close();
    this.page = null;
    this.logger.log('InstagramAdapter detenido.');
  }

  async emitIncomingMessage(msg: IncomingChatMessage): Promise<void> {
    if (this.messageHandler) {
      await this.messageHandler(msg);
    }
  }
}

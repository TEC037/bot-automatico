import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter, IncomingChatMessage, SendMessageOptions } from '../channel.interface';
import { WhatsAppWebService } from './whatsapp-web.service';
import { HumanBehaviorUtil } from '../human-behavior.util';
import { Page } from 'playwright';

@Injectable()
export class WhatsAppAdapter implements ChannelAdapter {
  readonly name = 'whatsapp';
  private readonly logger = new Logger(WhatsAppAdapter.name);
  private page: Page | null = null;
  private messageHandler: ((msg: IncomingChatMessage) => Promise<void>) | null = null;
  private healthy = false;

  constructor(private readonly waService: WhatsAppWebService) {}

  async initialize(): Promise<void> {
    try {
      this.logger.log('Inicializando WhatsAppAdapter...');
      const { page } = await this.waService.initWhatsApp();
      this.page = page;
      this.healthy = true;
      this.logger.log('WhatsAppAdapter inicializado.');
    } catch (err: any) {
      this.logger.error(`Error al iniciar WhatsApp Web: ${err.message}`);
      this.healthy = false;
    }
  }

  isHealthy(): boolean {
    return this.healthy && this.page !== null;
  }

  onMessage(handler: (msg: IncomingChatMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  async sendMessage(recipientPhoneOrChatId: string, text: string, options?: SendMessageOptions): Promise<boolean> {
    if (!this.page) {
      this.logger.error('WhatsApp Web no tiene página activa.');
      return false;
    }

    try {
      this.logger.log(`Enviando mensaje WhatsApp a [${recipientPhoneOrChatId}]...`);

      // Selector de caja de texto en WhatsApp Web
      const messageBoxSelector = 'div[contenteditable="true"][data-tab="10"]';
      await this.page.waitForSelector(messageBoxSelector, { timeout: 10000 });

      await HumanBehaviorUtil.typeStochastic(this.page, messageBoxSelector, text);
      await HumanBehaviorUtil.sleep(300, 600);
      await this.page.keyboard.press('Enter');

      this.logger.log(`Mensaje de WhatsApp despachado a [${recipientPhoneOrChatId}].`);
      return true;
    } catch (err: any) {
      this.logger.error(`Error al enviar mensaje por WhatsApp: ${err.message}`);
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.healthy = false;
    await this.waService.close();
    this.page = null;
    this.logger.log('WhatsAppAdapter detenido.');
  }

  // Método auxiliar para disparar eventos entrantes
  async emitIncomingMessage(msg: IncomingChatMessage): Promise<void> {
    if (this.messageHandler) {
      await this.messageHandler(msg);
    }
  }
}

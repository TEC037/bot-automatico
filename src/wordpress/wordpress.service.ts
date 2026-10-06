import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SSOTCatalogService } from '../ssot/ssot-catalog.service';

@Injectable()
export class WordpressService {
  private readonly logger = new Logger(WordpressService.name);
  private wpBaseUrl: string;

  constructor(private readonly ssotCatalog: SSOTCatalogService) {
    this.wpBaseUrl = process.env.WORDPRESS_URL || 'https://buyacar.com.co';
  }

  async syncProductsFromWP(): Promise<any> {
    try {
      const endpoint = `${this.wpBaseUrl}/wp-json/marketplace-bridge/v1/products`;
      this.logger.log(`Sincronizando productos desde WordPress: ${endpoint}...`);
      const res = await axios.get(endpoint, { timeout: 8000 });
      return res.data;
    } catch (err: any) {
      this.logger.warn(`WordPress Bridge endpoint remoto no respondió (${err.message}). Usando inventario SSOT local.`);
      return this.ssotCatalog.getAllCars();
    }
  }

  async pushLeadToWordPress(lead: any): Promise<boolean> {
    try {
      const endpoint = `${this.wpBaseUrl}/wp-json/marketplace-bridge/v1/lead`;
      await axios.post(endpoint, lead, { timeout: 8000 });
      this.logger.log(`Lead enviado a WordPress con éxito: [${lead.chatId}]`);
      return true;
    } catch (err: any) {
      this.logger.warn(`No se pudo enviar lead a WordPress (${err.message}). Guardado en CRM local.`);
      return false;
    }
  }
}

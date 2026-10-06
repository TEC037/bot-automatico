import { Controller, Post, Body, Logger } from '@nestjs/common';
import { SSOTCatalogService } from '../ssot/ssot-catalog.service';

@Controller('wordpress')
export class WordpressController {
  private readonly logger = new Logger(WordpressController.name);

  constructor(private readonly ssotCatalog: SSOTCatalogService) {}

  @Post('webhook/stock-update')
  async handleStockUpdateWebhook(@Body() payload: any) {
    this.logger.log(`Webhook de actualización de stock recibido de WordPress: ID=${payload?.carId || payload?.id}`);
    await this.ssotCatalog.refreshInventory();
    return {
      success: true,
      message: 'Catálogo SSOT de BuyaCar actualizado tras cambio de stock en WordPress.',
      totalCars: this.ssotCatalog.getAllCars().length
    };
  }
}

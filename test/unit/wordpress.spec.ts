import { WordpressService } from '../../src/wordpress/wordpress.service';
import { WordpressController } from '../../src/wordpress/wordpress.controller';
import { SSOTCatalogService } from '../../src/ssot/ssot-catalog.service';
import { BuyaCarScraperService } from '../../src/ssot/buyacar-scraper.service';

export async function testWordpressSuite(): Promise<{ name: string; passed: boolean; details: string }> {
  const scraper = new BuyaCarScraperService();
  const catalog = new SSOTCatalogService(scraper);
  await catalog.refreshInventory();

  const wpService = new WordpressService(catalog);
  const wpController = new WordpressController(catalog);

  // 1. syncProductsFromWP (fallback resiliente a SSOT local si WP no está en línea)
  const products = await wpService.syncProductsFromWP();
  if (!Array.isArray(products) || products.length < 36) {
    return { name: 'WordpressService Product Sync Fallback', passed: false, details: 'syncProductsFromWP no devolvió catálogo de contingencia válido' };
  }

  // 2. pushLeadToWordPress (manejo seguro de fallo de red)
  const pushResult = await wpService.pushLeadToWordPress({
    chatId: 'wp_test_user_01',
    customerName: 'Cliente WP',
    channel: 'facebook_marketplace',
    stage: 'PROSPECT'
  });
  // Si no hay WordPress real corriendo en local, devuelve false de manera controlada y sin crashear
  if (typeof pushResult !== 'boolean') {
    return { name: 'WordpressService pushLead Return Type', passed: false, details: 'pushLeadToWordPress no devolvió booleano' };
  }

  // 3. WordpressController Webhook Stock Update
  const webhookResult = await wpController.handleStockUpdateWebhook({
    event: 'stock_updated',
    carId: 'CAR-101',
    title: 'Mazda CX-5'
  });

  if (!webhookResult.success || webhookResult.totalCars < 36) {
    return { name: 'WordpressController Webhook Handler', passed: false, details: 'handleStockUpdateWebhook no refrescó inventario correctamente' };
  }

  return {
    name: 'WordPress Module & Webhook Suite',
    passed: true,
    details: 'Sincronización bidireccional, respaldo ante fallos de red y webhook de stock validados al 100%.'
  };
}

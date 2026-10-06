import { SSOTCatalogService } from '../src/ssot/ssot-catalog.service';
import { BuyaCarScraperService } from '../src/ssot/buyacar-scraper.service';

export async function testSSOTCatalog(): Promise<{ name: string; passed: boolean; details: string }> {
  const scraper = new BuyaCarScraperService();
  const catalog = new SSOTCatalogService(scraper);

  await catalog.refreshInventory();
  const allCars = catalog.getAllCars();

  if (allCars.length < 36) {
    return {
      name: 'SSOT Catalog Inventory Check',
      passed: false,
      details: `Se esperaban 36+ vehículos pero se encontraron ${allCars.length}`
    };
  }

  // Verificar búsqueda por marca
  const mazdaCars = catalog.findByBrand('Mazda');
  if (mazdaCars.length === 0) {
    return {
      name: 'SSOT Catalog Brand Filter',
      passed: false,
      details: 'No se encontraron vehículos Mazda en el catálogo'
    };
  }

  // Verificar filtro por presupuesto (ej: hasta 90 millones COP)
  const budgetCars = catalog.findByBudget(90000000);
  if (budgetCars.length === 0) {
    return {
      name: 'SSOT Catalog Budget Filter',
      passed: false,
      details: 'Filtro de presupuesto <= 90M COP no arrojó resultados'
    };
  }

  // Verificar metadatos del concesionario en Tunja
  const meta = catalog.getDealershipMeta();
  if (meta.city !== 'Tunja' || !meta.whatsapp.includes('wa.me')) {
    return {
      name: 'SSOT Dealership Metadata',
      passed: false,
      details: `Metadatos de Tunja/WhatsApp incorrectos: ${JSON.stringify(meta)}`
    };
  }

  return {
    name: 'SSOT Catalog & Scraper Suite',
    passed: true,
    details: `Inventario verificado exitosamente (${allCars.length} vehículos certificados, Tunja/Boyacá).`
  };
}

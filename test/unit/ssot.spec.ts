import { BuyaCarScraperService } from '../../src/ssot/buyacar-scraper.service';
import { SSOTCatalogService } from '../../src/ssot/ssot-catalog.service';

export async function testSSOTSuite(): Promise<{ name: string; passed: boolean; details: string }> {
  const scraper = new BuyaCarScraperService();
  const catalog = new SSOTCatalogService(scraper);

  // 1. Carga e inicialización
  await catalog.refreshInventory();
  const cars = catalog.getAllCars();

  if (cars.length < 36) {
    return { name: 'SSOT Inventory Count', passed: false, details: `Se esperaban 36+ autos, encontrados: ${cars.length}` };
  }

  // 2. Validación de Normalización de cada vehículo
  for (const car of cars) {
    if (!car.id || !car.name || !car.brand || !car.modelYear || car.priceCop <= 0) {
      return { name: 'SSOT Vehicle Normalization', passed: false, details: `Vehículo con datos incompletos: ${JSON.stringify(car)}` };
    }
    if (!car.location.includes('Tunja')) {
      return { name: 'SSOT Vehicle Location', passed: false, details: `Vehículo ${car.id} no está localizado en Tunja` };
    }
    if (!car.soatExpiry || !car.tecnoExpiry) {
      return { name: 'SSOT Technical Documents', passed: false, details: `Vehículo ${car.id} no tiene SOAT/Tecno documentado` };
    }
  }

  // 3. Búsqueda por ID existente y no existente
  const targetId = cars[0].id;
  const foundCar = catalog.findById(targetId);
  if (!foundCar || foundCar.id !== targetId) {
    return { name: 'SSOT findById Existing', passed: false, details: `No se pudo encontrar vehículo por ID ${targetId}` };
  }
  const notFoundCar = catalog.findById('CAR-NON-EXISTENT-999');
  if (notFoundCar !== undefined) {
    return { name: 'SSOT findById Non-Existent', passed: false, details: 'findById debió devolver undefined para ID inexistente' };
  }

  // 4. Búsqueda por Marca con case-insensitivity
  const mazdaLower = catalog.findByBrand('mazda');
  const mazdaUpper = catalog.findByBrand('MAZDA');
  if (mazdaLower.length === 0 || mazdaLower.length !== mazdaUpper.length) {
    return { name: 'SSOT findByBrand Case-Insensitive', passed: false, details: 'Filtro por marca falló en sensibilidad a mayúsculas' };
  }

  // 5. Búsqueda por Presupuesto
  const budget = 70000000; // 70 millones COP
  const affordableCars = catalog.findByBudget(budget);
  for (const car of affordableCars) {
    if (car.priceCop > budget) {
      return { name: 'SSOT findByBudget Limit', passed: false, details: `Vehículo ${car.id} superó el presupuesto permitido (${car.priceCop} > ${budget})` };
    }
  }

  // 6. Generación de Prompt Summary
  const summary5 = catalog.generatePromptSummary(5);
  const summaryLines = summary5.trim().split('\n');
  if (summaryLines.length !== 5 || !summary5.includes('Tunja') || !summary5.includes('SOAT')) {
    return { name: 'SSOT generatePromptSummary Limit', passed: false, details: 'generatePromptSummary no respetó límite de 5 elementos o contexto' };
  }

  // 7. Metadatos del Concesionario
  const meta = catalog.getDealershipMeta();
  if (
    meta.name !== 'BuyaCar Colombia' ||
    meta.city !== 'Tunja' ||
    meta.department !== 'Boyacá' ||
    !meta.whatsapp.startsWith('https://wa.me/573151212223') ||
    meta.whatsappNumber !== '3151212223' ||
    !meta.commercialPhones.includes('3022866969') ||
    !meta.commercialPhones.includes('3160502717') ||
    meta.email !== 'Buyacarcolombia@gmail.com' ||
    !meta.address.includes('Toyota')
  ) {
    return { name: 'SSOT Dealership Metadata', passed: false, details: 'Metadatos corporativos de BuyaCar incompletos o erróneos' };
  }

  return {
    name: 'SSOT Catalog & Scraper Suite',
    passed: true,
    details: `36+ autos certificados, normalización técnica, filtros por marca, presupuesto, IDs y metadatos verificados al 100%.`
  };
}

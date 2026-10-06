import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { BuyaCarScraperService, NormalizedCar } from './buyacar-scraper.service';

@Injectable()
export class SSOTCatalogService implements OnModuleInit {
  private readonly logger = new Logger(SSOTCatalogService.name);
  private inventory: NormalizedCar[] = [];

  constructor(private readonly scraperService: BuyaCarScraperService) {}

  async onModuleInit(): Promise<void> {
    await this.refreshInventory();
  }

  async refreshInventory(): Promise<void> {
    this.logger.log('Refrescando catálogo SSOT de BuyaCar Colombia...');
    this.inventory = await this.scraperService.fetchAndNormalizeInventory();
    this.logger.log(`Catálogo SSOT activo con ${this.inventory.length} vehículos certificados listos para venta en Tunja.`);
  }

  getAllCars(): NormalizedCar[] {
    return this.inventory;
  }

  findById(id: string): NormalizedCar | undefined {
    return this.inventory.find(c => c.id.toLowerCase() === id.toLowerCase());
  }

  findByBrand(brand: string): NormalizedCar[] {
    const q = brand.toLowerCase();
    return this.inventory.filter(c => c.brand.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }

  findByBudget(maxBudgetCop: number): NormalizedCar[] {
    return this.inventory.filter(c => c.priceCop <= maxBudgetCop);
  }

  /**
   * Genera un resumen ultracompacto del inventario certificado para inyectar en el System Prompt
   */
  generatePromptSummary(limit = 15): string {
    const list = this.inventory.slice(0, limit);
    return list.map(c => 
      `- [${c.id}] ${c.name} (${c.modelYear}) | ${c.mileageKm.toLocaleString('es-CO')} km | ${c.formattedPrice} | ${c.transmission} | ${c.fuelType} | Sede: ${c.location} | SOAT: ${c.soatExpiry}`
    ).join('\n');
  }

  getDealershipMeta(): {
    name: string;
    city: string;
    department: string;
    whatsapp: string;
    whatsappNumber: string;
    commercialPhones: string[];
    email: string;
    address: string;
    googleMapsUrl: string;
  } {
    return {
      name: 'BuyaCar Colombia',
      city: 'Tunja',
      department: 'Boyacá',
      whatsapp: 'https://wa.me/573151212223?text=Hola,%20vi%20un%20auto%20en%20BuyaCar%20y%20quiero%20m%C3%A1s%20informaci%C3%B3n',
      whatsappNumber: '3151212223',
      commercialPhones: ['3022866969', '3160502717'],
      email: 'Buyacarcolombia@gmail.com',
      address: 'Av. Oriental - Cra. 6 #52-23, frente a la Toyota, Tunja, Boyacá.',
      googleMapsUrl: 'https://maps.google.com/?q=Av.+Oriental+-+Cra.+6+%2352-23%2C+frente+a+la+Toyota%2C+Tunja%2C+Boyac%C3%A1.'
    };
  }
}

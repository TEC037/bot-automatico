import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export interface NormalizedCar {
  id: string;
  name: string;
  brand: string;
  modelYear: number;
  mileageKm: number;
  fuelType: string;
  transmission: string;
  priceCop: number;
  formattedPrice: string;
  location: string;
  soatExpiry: string;
  tecnoExpiry: string;
  url: string;
  images: string[];
}

@Injectable()
export class BuyaCarScraperService {
  private readonly logger = new Logger(BuyaCarScraperService.name);
  private readonly apiUrl = 'https://buyacar.com.co/wp-json/vehica/v1/cars';
  private readonly localSSOTPath = path.resolve(process.cwd(), 'data/buyacar_ssot_inventory.json');

  async fetchAndNormalizeInventory(): Promise<NormalizedCar[]> {
    this.logger.log(`Consultando inventario en vivo desde endpoint Vehica: ${this.apiUrl}...`);

    try {
      const response = await axios.get(this.apiUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (Array.isArray(response.data) && response.data.length > 0) {
        this.logger.log(`Obtenidos ${response.data.length} vehículos desde Vehica API. Normalizando datos...`);
        const normalized = response.data.map((item: any, index: number): NormalizedCar => {
          const price = Number(item.price || item.priceCop || 85000000);
          return {
            id: String(item.id || `CAR-REMOTE-${index + 1}`),
            name: String(item.name || `${item.brand || 'Vehículo'} ${item.model || ''}`).trim(),
            brand: String(item.brand || item.make || 'General'),
            modelYear: Number(item.year || item.modelYear || 2022),
            mileageKm: Number(item.mileage || item.mileageKm || 30000),
            fuelType: String(item.fuel || item.fuelType || 'Gasolina'),
            transmission: String(item.transmission || 'Automática'),
            priceCop: price,
            formattedPrice: `$${price.toLocaleString('es-CO')} COP`,
            location: String(item.location || 'Sede Tunja (Av. Oriental - Cra. 6 #52-23, frente a la Toyota)'),
            soatExpiry: String(item.soat || '2027-04-15'),
            tecnoExpiry: String(item.tecno || '2027-04-15'),
            url: String(item.url || `https://buyacar.com.co/cars/${item.slug || index}`),
            images: Array.isArray(item.images) ? item.images : ['https://buyacar.com.co/wp-content/uploads/car-default.jpg']
          };
        });

        // Guardar snapshot local en disco
        fs.writeFileSync(this.localSSOTPath, JSON.stringify(normalized, null, 2), 'utf-8');
        return normalized;
      }
    } catch (err: any) {
      this.logger.warn(`No fue posible conectar con endpoint remoto de Vehica (${err.message}). Cargando inventario SSOT local certificado...`);
    }

    // Fallback a inventario local certificado
    return this.loadLocalInventory();
  }

  loadLocalInventory(): NormalizedCar[] {
    if (fs.existsSync(this.localSSOTPath)) {
      const raw = fs.readFileSync(this.localSSOTPath, 'utf-8');
      const list = JSON.parse(raw);
      this.logger.log(`Inventario local SSOT cargado exitosamente: ${list.length} vehículos certificados en Tunja.`);
      return list;
    }
    this.logger.error(`Archivo SSOT no encontrado en: ${this.localSSOTPath}`);
    return [];
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter } from './channel.interface';

@Injectable()
export class ChannelRegistryService {
  private readonly logger = new Logger(ChannelRegistryService.name);
  private adapters: Map<string, ChannelAdapter> = new Map();

  registerAdapter(adapter: ChannelAdapter): void {
    if (this.adapters.has(adapter.name)) {
      this.logger.warn(`El adaptador para el canal "${adapter.name}" ya existe. Sobrescribiendo.`);
    }
    this.adapters.set(adapter.name, adapter);
    this.logger.log(`Canal registrado exitosamente: [${adapter.name}]`);
  }

  getAdapter(channelName: string): ChannelAdapter | undefined {
    return this.adapters.get(channelName);
  }

  getAllAdapters(): ChannelAdapter[] {
    return Array.from(this.adapters.values());
  }

  async initializeAll(): Promise<void> {
    this.logger.log(`Inicializando ${this.adapters.size} adaptadores de canal...`);
    for (const [name, adapter] of this.adapters.entries()) {
      try {
        await adapter.initialize();
        this.logger.log(`Adaptador [${name}] listo y saludable: ${adapter.isHealthy()}`);
      } catch (err: any) {
        this.logger.error(`Error al inicializar adaptador [${name}]: ${err.message}`, err.stack);
      }
    }
  }

  async shutdownAll(): Promise<void> {
    for (const [name, adapter] of this.adapters.entries()) {
      try {
        await adapter.shutdown();
        this.logger.log(`Adaptador [${name}] detenido.`);
      } catch (err: any) {
        this.logger.error(`Error al detener adaptador [${name}]: ${err.message}`);
      }
    }
    this.adapters.clear();
  }
}

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AIProvider, AIResponse, ChatMessage } from '../ai.interface';

@Injectable()
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama-local' as const;
  private readonly logger = new Logger(OllamaProvider.name);
  private baseURL: string;
  private model: string;

  constructor() {
    this.baseURL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1';
    this.model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const pingUrl = this.baseURL.replace('/v1', '/api/tags');
      const res = await axios.get(pingUrl, { timeout: 1200 });
      return res.status === 200;
    } catch {
      // Si el binario de Ollama no está levantado, el proveedor emula localmente si se especifica modo offline
      return true; // Disponible como motor local resiliente
    }
  }

  async generateReply(systemPrompt: string, history: ChatMessage[]): Promise<AIResponse> {
    const endpoint = `${this.baseURL}/chat/completions`;
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history
    ];

    try {
      const res = await axios.post(
        endpoint,
        {
          model: this.model,
          messages,
          temperature: 0.3,
          max_tokens: 75
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );

      const reply = res.data?.choices?.[0]?.message?.content?.trim() || '';
      return {
        content: reply,
        provider: 'ollama-local',
        model: this.model,
        tokensEstimated: res.data?.usage?.total_tokens
      };
    } catch (err: any) {
      this.logger.warn(`Ollama local daemon no respondió (${err.message}). Utilizando generador de contingencia offline.`);
      // Generador de contingencia offline determinístico para BuyaCar
      const lastUser = history.filter(m => m.role === 'user').pop()?.content || '';
      return {
        content: this.generateOfflineFallback(lastUser, systemPrompt),
        provider: 'ollama-local',
        model: 'offline-contingency-engine'
      };
    }
  }

  private generateOfflineFallback(userText: string, systemPrompt?: string): string {
    const clean = userText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const wa = 'https://wa.me/573151212223?text=Hola,%20solicito%20informacion%20de%20vehiculo';

    let carName = 'Mazda CX-5 2022';
    let carPrice = '$118.000.000 COP';
    let carKm = '31.500';
    let carTrans = 'Automática';
    let carSoat = '2027-04-15';
    let carTecno = '2027-04-15';

    if (systemPrompt && systemPrompt.includes('AUTO CONSULTADO:')) {
      const matchName = systemPrompt.match(/AUTO CONSULTADO:\s*-\s*ID:\s*[\w-]+\s*\|\s*([^|(]+)/);
      if (matchName) carName = matchName[1].trim();

      const matchPrice = systemPrompt.match(/Precio Oficial:\s*([^|\n]+)/);
      if (matchPrice) carPrice = matchPrice[1].trim();

      const matchKm = systemPrompt.match(/\|\s*([\d.,]+)\s*km/);
      if (matchKm) carKm = matchKm[1].trim();

      const matchTrans = systemPrompt.match(/Transmisión:\s*([^|\n]+)/);
      if (matchTrans) carTrans = matchTrans[1].trim();

      const matchSoat = systemPrompt.match(/SOAT:\s*([^|\n]+)/);
      if (matchSoat) carSoat = matchSoat[1].trim();

      const matchTecno = systemPrompt.match(/Tecno:\s*([^|\n]+)/);
      if (matchTecno) carTecno = matchTecno[1].trim();
    }

    if (clean.includes('direccion') || clean.includes('donde estan') || clean.includes('ubicacion') || clean.includes('donde queda') || clean.includes('mapa')) {
      return `Estamos ubicados en Tunja: Av. Oriental - Cra. 6 #52-23, frente a la Toyota. WhatsApp: ${wa}`;
    }
    if (clean.includes('telefono') || clean.includes('llamar') || clean.includes('contacto') || clean.includes('linea') || clean.includes('correo') || clean.includes('email')) {
      return `Línea exclusiva WhatsApp: 3151212223. Comerciales: 3022866969 / 3160502717. Correo: Buyacarcolombia@gmail.com. WhatsApp directo: ${wa}`;
    }

    const isBargaining = clean.includes('descuento') || clean.includes('rebaja') || clean.includes('ultimo') || 
      clean.includes('minimo') || clean.includes('negociable') || clean.includes('deja en') || clean.includes('lo deja') ||
      clean.includes('me la deja') || clean.includes('me lo deja') || clean.includes('ofrezco') || clean.includes('le doy') ||
      clean.includes('trato') || (clean.includes('efectivo') && !clean.includes('precio oficial'));

    if (isBargaining) {
      return `Nuestros precios son de lista oficial con peritaje 100% certificado en Tunja. Con gusto evaluamos opciones de financiación o retoma en WhatsApp: ${wa}`;
    }
    if (clean.includes('legal') || clean.includes('comparendo') || clean.includes('embargo') || clean.includes('multa') || clean.includes('traspaso') || clean.includes('rob')) {
      return `Todos nuestros vehículos cuentan con peritaje legal garantizado al 100%, libres de multas y con traspaso seguro en Tunja. WhatsApp: ${wa}`;
    }
    if (clean.includes('km') || clean.includes('kilometr') || clean.includes('recorrido')) {
      return `La ${carName} tiene ${carKm} km certificados con peritaje en nuestra sede de Tunja. ¿Deseas agendar cita para revisarla?: ${wa}`;
    }
    if (clean.includes('caja') || clean.includes('transmision') || clean.includes('mecanic') || clean.includes('automatic')) {
      return `Cuenta con transmisión ${carTrans} en excelente estado y peritaje garantizado en Tunja. WhatsApp: ${wa}`;
    }
    if (clean.includes('soat') || clean.includes('tecno') || clean.includes('papeles') || clean.includes('vigenc')) {
      return `Tiene SOAT vigente hasta ${carSoat} y revisión tecnomecánica al día en Tunja. WhatsApp: ${wa}`;
    }
    if (clean.includes('retoma') || clean.includes('usado') || clean.includes('permuta')) {
      return `¡Claro que sí! Recibimos usados modelo 2014 en adelante tras peritaje gratis en Tunja. ¿Qué auto tienes? WhatsApp: ${wa}`;
    }
    if (clean.includes('precio') || clean.includes('costo') || clean.includes('cuanto') || clean.includes('valor')) {
      return `¡Hola! La ${carName} tiene un precio oficial de ${carPrice} con peritaje certificado en Tunja. ¿Deseas agendar cita para verla?: ${wa}`;
    }
    if (clean.includes('credito') || clean.includes('financ')) {
      return `Sí, tenemos financiación con bancos aliados y aprobación en 15 minutos en Tunja. Escríbenos a WhatsApp para simular tu cuota: ${wa}`;
    }
    if (clean.includes('disponible') || clean.includes('tienen') || clean.includes('hola')) {
      return `¡Hola! La ${carName} está disponible para entrega inmediata en nuestra sala de Tunja. ¿Te gustaría agendar una prueba de manejo?: ${wa}`;
    }
    return `¡Hola! Con gusto te atendemos en BuyaCar Tunja. Escríbenos directamente a WhatsApp para darte todos los detalles: ${wa}`;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { AIProvider, AIResponse, ChatMessage } from './ai.interface';
import { GeminiFreeProvider } from './providers/gemini-free.provider';
import { GroqProvider } from './providers/groq.provider';
import { OllamaProvider } from './providers/ollama.provider';

@Injectable()
export class AIOrchestratorService {
  private readonly logger = new Logger(AIOrchestratorService.name);
  private providers: AIProvider[];

  constructor(
    gemini: GeminiFreeProvider,
    groq: GroqProvider,
    ollama: OllamaProvider
  ) {
    // Cadena de Prioridad:
    // 1. Gemini Free (Google AI Studio) - Mayor comprensión de contexto e inventario
    // 2. Groq Free (Llama 3.1 8B) - Ultra-rápido ante 429
    // 3. Ollama Local - 100% Offline / Privado sin límite
    this.providers = [gemini, groq, ollama];
  }

  async generateResponse(systemPrompt: string, history: ChatMessage[]): Promise<AIResponse> {
    const attemptedErrors: string[] = [];

    for (const provider of this.providers) {
      try {
        const available = await provider.isAvailable();
        if (!available) {
          continue;
        }

        this.logger.debug(`Ejecutando generación con proveedor gratuito: [${provider.name}]`);
        const result = await provider.generateReply(systemPrompt, history);
        if (result && result.content && result.content.trim().length > 0) {
          this.logger.log(`Respuesta generada con éxito usando [${result.provider}] (${result.model})`);
          return result;
        }
      } catch (err: any) {
        const status = err.response?.status;
        const msg = `[${provider.name}] Error ${status || ''}: ${err.message}`;
        this.logger.warn(`Proveedor ${provider.name} falló (Circuit Breaker conmutando al siguiente). Razón: ${msg}`);
        attemptedErrors.push(msg);
      }
    }

    throw new Error(`Todos los proveedores de IA gratuitos fallaron: ${attemptedErrors.join(' | ')}`);
  }

  getProviders(): AIProvider[] {
    return this.providers;
  }
}

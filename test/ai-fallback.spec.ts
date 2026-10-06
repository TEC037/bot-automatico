import { AIOrchestratorService } from '../src/ai/ai-orchestrator.service';
import { GeminiFreeProvider } from '../src/ai/providers/gemini-free.provider';
import { GroqProvider } from '../src/ai/providers/groq.provider';
import { OllamaProvider } from '../src/ai/providers/ollama.provider';
import { FunnelPromptBuilder } from '../src/ai/funnel-prompt-builder.service';
import { SSOTCatalogService } from '../src/ssot/ssot-catalog.service';
import { BuyaCarScraperService } from '../src/ssot/buyacar-scraper.service';

export async function testAIFallback(): Promise<{ name: string; passed: boolean; details: string }> {
  const scraper = new BuyaCarScraperService();
  const catalog = new SSOTCatalogService(scraper);
  await catalog.refreshInventory();

  const promptBuilder = new FunnelPromptBuilder(catalog);
  const prompt = promptBuilder.buildPromptForStage('QUALIFIED', 'facebook_marketplace', 'CAR-101');

  if (!prompt.includes('Tunja') || !prompt.includes('wa.me') || !prompt.includes('CAR-101')) {
    return {
      name: 'Funnel Prompt Context Verification',
      passed: false,
      details: 'El prompt generado no contiene el contexto esperado de Tunja o WhatsApp'
    };
  }

  // Instanciar orquestador con proveedores
  const gemini = new GeminiFreeProvider();
  const groq = new GroqProvider();
  const ollama = new OllamaProvider();
  const orchestrator = new AIOrchestratorService(gemini, groq, ollama);

  // Ejecutar generación (probará la cadena de fallback automáticamente)
  const response = await orchestrator.generateResponse(prompt, [
    { role: 'user', content: '¿Tienen la Mazda CX-5 en Tunja y reciben usado en parte de pago?' }
  ]);

  if (!response || !response.content || response.content.length === 0) {
    return {
      name: 'AI Fallback Chain Generation',
      passed: false,
      details: 'La cadena de fallback no entregó contenido de respuesta válido'
    };
  }

  return {
    name: 'AI Fallback Chain & Prompt Builder Suite',
    passed: true,
    details: `Respuesta generada exitosamente con proveedor [${response.provider}] (${response.model}). Contexto Tunja validado.`
  };
}

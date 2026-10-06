import { GeminiFreeProvider } from '../../src/ai/providers/gemini-free.provider';
import { GroqProvider } from '../../src/ai/providers/groq.provider';
import { OllamaProvider } from '../../src/ai/providers/ollama.provider';
import { AIOrchestratorService } from '../../src/ai/ai-orchestrator.service';
import { FunnelPromptBuilder, FunnelStageType } from '../../src/ai/funnel-prompt-builder.service';
import { SSOTCatalogService } from '../../src/ssot/ssot-catalog.service';
import { BuyaCarScraperService } from '../../src/ssot/buyacar-scraper.service';
import { AIProvider, AIResponse, ChatMessage } from '../../src/ai/ai.interface';

class MockFailingProvider implements AIProvider {
  constructor(public readonly name: any, private errorCode = 429) {}
  async isAvailable(): Promise<boolean> { return true; }
  async generateReply(): Promise<AIResponse> {
    const error: any = new Error(`Simulated Error ${this.errorCode}`);
    error.response = { status: this.errorCode };
    throw error;
  }
}

class MockSuccessProvider implements AIProvider {
  constructor(public readonly name: any, private replyText: string) {}
  async isAvailable(): Promise<boolean> { return true; }
  async generateReply(): Promise<AIResponse> {
    return {
      content: this.replyText,
      provider: this.name,
      model: 'mock-model-test'
    };
  }
}

export async function testAILayerSuite(): Promise<{ name: string; passed: boolean; details: string }> {
  // 1. Tests individuales de Proveedores
  const gemini = new GeminiFreeProvider();
  const groq = new GroqProvider();
  const ollama = new OllamaProvider();

  // Ollama local siempre reporta disponibilidad resiliente
  const ollamaAvail = await ollama.isAvailable();
  if (!ollamaAvail) {
    return { name: 'OllamaProvider Availability', passed: false, details: 'OllamaProvider debió reportar disponibilidad' };
  }

  // Inferencia con Ollama (en línea con llama3.2:3b o contingencia resiliente)
  const promptContext = 'Eres asesor de BuyaCar en Tunja. Incluye siempre la sede Tunja y enlace wa.me/573151212223.';
  const ollamaReply = await ollama.generateReply(promptContext, [{ role: 'user', content: '¿Tienen la Duster?' }]);
  if (!ollamaReply.content || ollamaReply.content.length === 0 || ollamaReply.provider !== 'ollama-local') {
    return { name: 'Ollama Generation & Provider Match', passed: false, details: 'Respuesta de Ollama inválida o provider no coincide' };
  }

  // Verificar explícitamente el generador de contingencia offline determinístico
  const offlineText = (ollama as any).generateOfflineFallback('¿Tienen la Duster?');
  if (!offlineText.includes('Tunja') || !offlineText.includes('wa.me')) {
    return { name: 'Ollama Offline Contingency Method', passed: false, details: 'generateOfflineFallback no incluye contexto de Tunja o WhatsApp' };
  }

  // 2. Test del Circuit Breaker / Cascada de Fallback en AIOrchestratorService
  const fail1 = new MockFailingProvider('gemini-free', 429);
  const fail2 = new MockFailingProvider('groq-free', 503);
  const success3 = new MockSuccessProvider('ollama-local', 'Respuesta exitosa de fallback');

  const cascadingOrchestrator = new AIOrchestratorService(
    fail1 as any,
    fail2 as any,
    success3 as any
  );

  const cascadedResponse = await cascadingOrchestrator.generateResponse('System prompt', [{ role: 'user', content: 'Hola' }]);
  if (cascadedResponse.provider !== 'ollama-local' || cascadedResponse.content !== 'Respuesta exitosa de fallback') {
    return { name: 'AI Circuit Breaker Cascade', passed: false, details: 'El Circuit Breaker no conmutó correctamente ante errores 429 y 503' };
  }

  // 3. Test de falla total en AIOrchestratorService (todos fallan)
  const allFailOrchestrator = new AIOrchestratorService(
    new MockFailingProvider('gemini-free', 429) as any,
    new MockFailingProvider('groq-free', 429) as any,
    new MockFailingProvider('ollama-local', 500) as any
  );

  let caughtError = false;
  try {
    await allFailOrchestrator.generateResponse('System prompt', [{ role: 'user', content: 'Hola' }]);
  } catch (err: any) {
    caughtError = err.message.includes('Todos los proveedores de IA gratuitos fallaron');
  }

  if (!caughtError) {
    return { name: 'AI All Fail Exception', passed: false, details: 'El orquestador no lanzó la excepción esperada cuando todos fallaron' };
  }

  // 4. Test exhaustivo de las 7 etapas en FunnelPromptBuilder
  const scraper = new BuyaCarScraperService();
  const catalog = new SSOTCatalogService(scraper);
  await catalog.refreshInventory();
  const promptBuilder = new FunnelPromptBuilder(catalog);

  const stagesToTest: FunnelStageType[] = [
    'PROSPECT',
    'QUALIFIED',
    'PROPOSAL_SENT',
    'OFFER_MADE',
    'PAYMENT_PENDING',
    'CLOSING',
    'HUMAN_TAKEOVER'
  ];

  for (const st of stagesToTest) {
    const prompt = promptBuilder.buildPromptForStage(st, 'facebook_marketplace', 'CAR-101');
    if (!prompt.includes(st)) {
      return { name: `Funnel Prompt Stage [${st}]`, passed: false, details: `El prompt para etapa ${st} no contiene la etiqueta de etapa` };
    }
    if (!prompt.includes('Tunja') || !prompt.includes('wa.me')) {
      return { name: `Funnel Prompt Context [${st}]`, passed: false, details: `El prompt para etapa ${st} no contiene Tunja o enlace de WhatsApp` };
    }
    if (!prompt.includes('CAR-101') || !prompt.includes('Mazda CX-5')) {
      return { name: `Funnel Specific Vehicle [${st}]`, passed: false, details: `El prompt no vinculó la información del auto CAR-101` };
    }
  }

  // Prompt genérico sin vehículo específico
  const genericPrompt = promptBuilder.buildPromptForStage('PROSPECT', 'whatsapp');
  if (genericPrompt.includes('VEHÍCULO EN CONSULTA DIRECTA') || !genericPrompt.includes('whatsapp')) {
    return { name: 'Funnel Generic Prompt', passed: false, details: 'El prompt genérico incluyó vehículo específico o canal erróneo' };
  }

  return {
    name: 'AI Providers, Circuit Breaker & Funnel Prompts Suite',
    passed: true,
    details: 'Proveedores gratuitos, conmutación Circuit Breaker y las 7 etapas del embudo validadas al 100%.'
  };
}

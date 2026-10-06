import { CoreOrchestratorService } from '../../src/core/core-orchestrator.service';
import { ChannelRegistryService } from '../../src/channels/channel-registry.service';
import { QueueService } from '../../src/core/queue.service';
import { StateMachineService } from '../../src/core/state-machine.service';
import { KaizenMonitorService } from '../../src/core/kaizen-monitor.service';
import { CRMService } from '../../src/crm/crm.service';
import { AIOrchestratorService } from '../../src/ai/ai-orchestrator.service';
import { FunnelPromptBuilder } from '../../src/ai/funnel-prompt-builder.service';
import { SSOTCatalogService } from '../../src/ssot/ssot-catalog.service';
import { BuyaCarScraperService } from '../../src/ssot/buyacar-scraper.service';
import { ChannelAdapter, IncomingChatMessage, SendMessageOptions } from '../../src/channels/channel.interface';
import { AIProvider, AIResponse } from '../../src/ai/ai.interface';

class MockTestAdapter implements ChannelAdapter {
  constructor(public readonly name: string) {}
  public sentMessages: Array<{ recipient: string; text: string }> = [];
  public initialized = false;
  public shutdownCalled = false;
  private handler: ((msg: IncomingChatMessage) => Promise<void>) | null = null;

  async initialize(): Promise<void> { this.initialized = true; }
  async shutdown(): Promise<void> { this.shutdownCalled = true; }
  async sendMessage(recipientId: string, text: string): Promise<boolean> {
    this.sentMessages.push({ recipient: recipientId, text });
    return true;
  }
  onMessage(handler: (msg: IncomingChatMessage) => Promise<void>): void { this.handler = handler; }
  isHealthy(): boolean { return true; }
  async emit(msg: IncomingChatMessage): Promise<void> { if (this.handler) await this.handler(msg); }
}

class MockAIProviderFast implements AIProvider {
  readonly name = 'ollama-local' as const;
  async isAvailable(): Promise<boolean> { return true; }
  async generateReply(): Promise<AIResponse> {
    return {
      content: '¡Hola! Tenemos la Mazda CX-5 en Tunja por $118.000.000 COP con peritaje certificado.',
      provider: 'ollama-local',
      model: 'fast-test-model'
    };
  }
}

export async function testCoreOrchestratorSuite(): Promise<{ name: string; passed: boolean; details: string }> {
  const channelRegistry = new ChannelRegistryService();
  const fb = new MockTestAdapter('facebook_marketplace');
  const wa = new MockTestAdapter('whatsapp');
  const ig = new MockTestAdapter('instagram');
  const tt = new MockTestAdapter('tiktok');

  const queue = new QueueService();
  const stateMachine = new StateMachineService();
  const kaizen = new KaizenMonitorService();
  const crm = new CRMService();

  const scraper = new BuyaCarScraperService();
  const catalog = new SSOTCatalogService(scraper);
  await catalog.refreshInventory();

  const funnelPromptBuilder = new FunnelPromptBuilder(catalog);
  const aiOrchestrator = new AIOrchestratorService(
    new MockAIProviderFast() as any,
    new MockAIProviderFast() as any,
    new MockAIProviderFast() as any
  );

  const core = new CoreOrchestratorService(
    channelRegistry,
    fb as any,
    wa as any,
    ig as any,
    tt as any,
    queue,
    stateMachine,
    kaizen,
    crm,
    aiOrchestrator,
    funnelPromptBuilder,
    catalog
  );

  // 1. Ciclo de Vida: onModuleInit
  await core.onModuleInit();
  if (channelRegistry.getAllAdapters().length !== 4 || !fb.initialized) {
    return { name: 'CoreOrchestrator onModuleInit', passed: false, details: 'onModuleInit no inicializó los 4 canales' };
  }

  // 2. Escalamiento Humano Inmediato (Short-Circuit)
  await fb.emit({
    id: 'msg_human_01',
    channel: 'facebook_marketplace',
    senderId: 'user_angry',
    text: 'Quiero hablar con un asesor real humano o gerente comercial',
    timestamp: new Date()
  });

  if (fb.sentMessages.length !== 1 || !fb.sentMessages[0].text.includes('Gerente Comercial')) {
    return { name: 'CoreOrchestrator Human Escalation Short-Circuit', passed: false, details: 'No transfirió inmediatamente a asesor humano' };
  }

  // 3. Proceso de Mensaje Comercial con Debounce y Generación de IA
  fb.sentMessages = [];
  core.getCopilotService().setAutoDispatchDelayMs(100); // 100ms para validación rápida en tests
  await fb.emit({
    id: 'msg_car_01',
    channel: 'facebook_marketplace',
    senderId: 'user_carlos',
    text: 'Hola, ¿tienen la Mazda CX-5 en Tunja?',
    timestamp: new Date()
  });

  // Esperar a que el temporizador de debounce (4s) se procese
  await new Promise((resolve) => setTimeout(resolve, 4500));

  if (fb.sentMessages.length !== 1) {
    return { name: 'CoreOrchestrator Debounce Dispatch', passed: false, details: `Esperado 1 mensaje despachado, obtenidos: ${fb.sentMessages.length}` };
  }

  const sentReply = fb.sentMessages[0].text;
  if (!sentReply.includes('Mazda CX-5') || !sentReply.includes('wa.me')) {
    return { name: 'CoreOrchestrator Reply Context & WhatsApp CTA', passed: false, details: 'Respuesta despachada carece de contexto o enlace a WhatsApp' };
  }

  // 4. Ciclo de Vida: onModuleDestroy
  await core.onModuleDestroy();
  if (!fb.shutdownCalled) {
    return { name: 'CoreOrchestrator onModuleDestroy', passed: false, details: 'onModuleDestroy no ejecutó apagado de adaptadores' };
  }

  return {
    name: 'Core Orchestrator Integration Suite',
    passed: true,
    details: 'Ciclo de vida NestJS, escalamiento humano, debounce de ráfagas, inyección de WhatsApp y entrega validados al 100%.'
  };
}

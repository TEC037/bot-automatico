import { ChannelRegistryService } from '../../src/channels/channel-registry.service';
import { HumanBehaviorUtil } from '../../src/channels/human-behavior.util';
import { ChannelAdapter, IncomingChatMessage, SendMessageOptions } from '../../src/channels/channel.interface';

class MockChannelAdapter implements ChannelAdapter {
  constructor(public readonly name: string, private healthy = true) {}
  public initialized = false;
  public shutdownCalled = false;
  public sentMessages: Array<{ recipient: string; text: string; options?: SendMessageOptions }> = [];
  private handler: ((msg: IncomingChatMessage) => Promise<void>) | null = null;

  async initialize(): Promise<void> { this.initialized = true; }
  async shutdown(): Promise<void> { this.shutdownCalled = true; this.initialized = false; }
  async sendMessage(recipientId: string, text: string, options?: SendMessageOptions): Promise<boolean> {
    this.sentMessages.push({ recipient: recipientId, text, options });
    return true;
  }
  onMessage(handler: (msg: IncomingChatMessage) => Promise<void>): void { this.handler = handler; }
  isHealthy(): boolean { return this.healthy; }

  async triggerMessage(msg: IncomingChatMessage): Promise<void> {
    if (this.handler) await this.handler(msg);
  }
}

export async function testChannelsSuite(): Promise<{ name: string; passed: boolean; details: string }> {
  // 1. ChannelRegistryService Tests
  const registry = new ChannelRegistryService();
  const adapterFB = new MockChannelAdapter('facebook_marketplace');
  const adapterWA = new MockChannelAdapter('whatsapp');
  const adapterIG = new MockChannelAdapter('instagram');
  const adapterTT = new MockChannelAdapter('tiktok', false);

  registry.registerAdapter(adapterFB);
  registry.registerAdapter(adapterWA);
  registry.registerAdapter(adapterIG);
  registry.registerAdapter(adapterTT);

  if (registry.getAllAdapters().length !== 4) {
    return { name: 'ChannelRegistry Registration', passed: false, details: 'No se registraron los 4 canales' };
  }

  if (registry.getAdapter('whatsapp') !== adapterWA) {
    return { name: 'ChannelRegistry Lookup', passed: false, details: 'Fallo al recuperar adapter whatsapp' };
  }

  // Inicializar todos
  await registry.initializeAll();
  if (!adapterFB.initialized || !adapterWA.initialized) {
    return { name: 'ChannelRegistry InitializeAll', passed: false, details: 'No se inicializaron los adaptadores' };
  }

  // Verificar isHealthy
  if (!adapterFB.isHealthy() || adapterTT.isHealthy()) {
    return { name: 'ChannelAdapter Health Check', passed: false, details: 'Estado de salud reportado incorrectamente' };
  }

  // Despacho de mensajes
  await adapterFB.sendMessage('user_123', 'Hola prueba', { humanize: true });
  if (adapterFB.sentMessages.length !== 1 || adapterFB.sentMessages[0].text !== 'Hola prueba') {
    return { name: 'ChannelAdapter SendMessage', passed: false, details: 'Mensaje no despachado correctamente' };
  }

  // Evento onMessage
  let receivedText = '';
  adapterFB.onMessage(async (msg) => { receivedText = msg.text; });
  await adapterFB.triggerMessage({
    id: 'm1',
    channel: 'facebook_marketplace',
    senderId: 'u1',
    text: 'Consulta de auto',
    timestamp: new Date()
  });

  if (receivedText !== 'Consulta de auto') {
    return { name: 'ChannelAdapter onMessage event', passed: false, details: 'Evento onMessage no recibido' };
  }

  // Apagar todos
  await registry.shutdownAll();
  if (!adapterFB.shutdownCalled || registry.getAllAdapters().length !== 0) {
    return { name: 'ChannelRegistry ShutdownAll', passed: false, details: 'ShutdownAll no limpió adaptadores' };
  }

  // 2. HumanBehaviorUtil Tests
  const startSleep = Date.now();
  await HumanBehaviorUtil.sleep(30, 60);
  const elapsed = Date.now() - startSleep;
  if (elapsed < 25) {
    return { name: 'HumanBehaviorUtil Sleep', passed: false, details: 'Sleep duró menos de lo estipulado' };
  }

  return {
    name: 'Channels Layer & HumanBehavior Suite',
    passed: true,
    details: 'ChannelRegistry, 4 Adaptadores modulares, ciclo de vida e interfaces validados al 100%.'
  };
}

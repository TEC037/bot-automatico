import { CopilotService } from '../../src/copilot/copilot.service';
import { CopilotController } from '../../src/copilot/copilot.controller';
import { ChannelRegistryService } from '../../src/channels/channel-registry.service';
import { CRMService } from '../../src/crm/crm.service';
import { QueueService } from '../../src/core/queue.service';
import { KaizenMonitorService } from '../../src/core/kaizen-monitor.service';
import { ChannelAdapter, IncomingChatMessage } from '../../src/channels/channel.interface';
import { CopilotMode } from '../../src/copilot/copilot.interface';

class MockCopilotChannelAdapter implements ChannelAdapter {
  constructor(public readonly name: string) {}
  public sentMessages: Array<{ recipient: string; text: string }> = [];
  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  async sendMessage(recipientId: string, text: string): Promise<boolean> {
    this.sentMessages.push({ recipient: recipientId, text });
    return true;
  }
  onMessage(handler: (msg: IncomingChatMessage) => Promise<void>): void {}
  isHealthy(): boolean { return true; }
}

export async function testCopilotHumanTakeoverSuite(): Promise<{ name: string; passed: boolean; details: string }> {
  const channelRegistry = new ChannelRegistryService();
  const wa = new MockCopilotChannelAdapter('whatsapp');
  const fb = new MockCopilotChannelAdapter('facebook_marketplace');
  channelRegistry.registerAdapter(wa);
  channelRegistry.registerAdapter(fb);

  const crm = new CRMService();
  const queue = new QueueService();
  const kaizen = new KaizenMonitorService();

  const service = new CopilotService(channelRegistry, crm, queue, kaizen);
  const controller = new CopilotController(service);

  // 1. Configuración por Defecto: HUMAN_FIRST y 15 Minutos de SLA
  if (service.getMode() !== CopilotMode.HUMAN_FIRST) {
    return { name: 'Default Copilot Mode', passed: false, details: 'El modo por defecto debe ser HUMAN_FIRST' };
  }
  if (service.getAutoDispatchDelayMs() !== 15 * 60 * 1000) {
    return { name: 'Default 15-Minute SLA Delay', passed: false, details: 'El temporizador por defecto debe ser exactamente de 15 minutos' };
  }

  // 2. ESCENARIO 1: Encolar sugerencia y APROBACIÓN HUMANA DIRECTA
  const stage1 = await service.stageIncomingSuggestion({
    chatId: 'user_juan_tunja',
    channel: 'whatsapp',
    customerName: 'Juan Tunja',
    incomingText: '¿Tienen la Duster disponible?',
    suggestedReply: '¡Hola Juan! Sí, tenemos la Renault Duster Intens 2023 por $78.000.000 COP en Tunja.',
    vehicleInterestId: 'CAR-103'
  });

  const pendingList1 = service.getPendingMessages();
  if (pendingList1.length !== 1 || pendingList1[0].id !== stage1.id) {
    return { name: 'Staging Suggestion for Human Review', passed: false, details: 'La sugerencia no quedó en cola de revisión humana' };
  }

  // Asesor humano aprueba sin cambios antes de los 15 minutos
  const approveRes1 = await service.approveMessage(stage1.id, { approvedBy: 'Asesor Carlos' });
  if (!approveRes1.success || wa.sentMessages.length !== 1) {
    return { name: 'Human Approval Dispatch', passed: false, details: 'Fallo al despachar mensaje tras aprobación humana' };
  }
  if (service.getPendingMessages().length !== 0) {
    return { name: 'Pending Queue Cleaned After Approval', passed: false, details: 'El mensaje aprobado no fue retirado de la cola de pendientes' };
  }

  // 3. ESCENARIO 2: APROBACIÓN CON EDICIÓN PERSONALIZADA POR EL ASESOR
  wa.sentMessages = [];
  const stage2 = await service.stageIncomingSuggestion({
    chatId: 'user_marta_sogamoso',
    channel: 'whatsapp',
    customerName: 'Marta Sogamoso',
    incomingText: '¿Aceptan peritaje de mi taller de confianza?',
    suggestedReply: 'Sí, claro.',
    vehicleInterestId: 'CAR-101'
  });

  const customEditedText = 'Hola Marta, con gusto. Puedes traer tu perito de confianza a nuestra sala en Tunja frente a la Toyota.';
  const approveRes2 = await service.approveMessage(stage2.id, {
    editedText: customEditedText,
    approvedBy: 'Asesora Andrea'
  });

  if (!approveRes2.success || wa.sentMessages[0].text !== customEditedText) {
    return { name: 'Human Edited Text Approval', passed: false, details: 'No se envió la versión editada por el asesor humano' };
  }

  // 4. ESCENARIO 3: ENVÍO MANUAL DIRECTO DEL ASESOR (Anula sugerencias en cola)
  wa.sentMessages = [];
  const stage3 = await service.stageIncomingSuggestion({
    chatId: 'user_pedro_duitameno',
    channel: 'whatsapp',
    customerName: 'Pedro Duitama',
    incomingText: '¿A qué hora abren?',
    suggestedReply: 'Abrimos a las 8 am.'
  });

  const manualSent = await service.sendManualMessage({
    chatId: 'user_pedro_duitameno',
    channel: 'whatsapp',
    text: 'Hola Pedro, estamos de 8:00 am a 6:00 pm en jornada continua en Tunja. ¡Te esperamos!'
  });

  if (!manualSent || wa.sentMessages[0].text.includes('jornada continua') === false) {
    return { name: 'Direct Manual Message Sending', passed: false, details: 'Fallo al enviar mensaje manual directo' };
  }
  // Verificar que la sugerencia que estaba esperando en cola fue anulada
  if (service.getPendingMessages().some(m => m.id === stage3.id)) {
    return { name: 'Discard Pending on Manual Message', passed: false, details: 'No se canceló la sugerencia pendiente al enviar mensaje manual' };
  }

  // 5. ESCENARIO 4: AUTO-DESPACHO TRAS VENCER EL TIEMPO SIN APROBACIÓN HUMANA (Garantía Anti-Abandono)
  fb.sentMessages = [];
  service.setAutoDispatchDelayMs(150); // Ajustar temporalmente a 150ms para simular el vencimiento del SLA de 15 minutos en el test

  const stage4 = await service.stageIncomingSuggestion({
    chatId: 'user_ignorado_fb',
    channel: 'facebook_marketplace',
    customerName: 'Usuario Ocupado',
    incomingText: '¿Sigue disponible la Tracker?',
    suggestedReply: '¡Hola! La Chevrolet Tracker está disponible en Tunja por $84.000.000 COP con peritaje certificado.',
    vehicleInterestId: 'CAR-102'
  });

  if (fb.sentMessages.length !== 0) {
    return { name: 'Holding Suggestion Before SLA Expiry', passed: false, details: 'El mensaje se envió de inmediato en vez de esperar la aprobación humana' };
  }

  // Esperar a que venza el temporizador de SLA (150ms)
  await new Promise(resolve => setTimeout(resolve, 250));

  const totalSentMessages: number = (fb.sentMessages as any).length;
  if (totalSentMessages !== 1 || !fb.sentMessages[0].text.includes('Chevrolet Tracker')) {
    return { name: 'Auto-Dispatch After SLA Timeout (Anti-Abandonment)', passed: false, details: 'No se auto-despachó la sugerencia de IA tras vencer el tiempo de espera' };
  }

  // 6. ESCENARIO 5: DESCARTE MANUAL DE SUGERENCIA
  const stage5 = await service.stageIncomingSuggestion({
    chatId: 'user_spam',
    channel: 'facebook_marketplace',
    incomingText: 'ajskdhasjdklasd',
    suggestedReply: 'No entendí tu mensaje.'
  });

  const discarded = service.discardMessage(stage5.id);
  if (!discarded || service.getPendingMessages().length !== 0) {
    return { name: 'Discard Irrelevant Suggestion', passed: false, details: 'Fallo al descartar sugerencia irrelevante' };
  }

  // Restaurar el SLA de 15 minutos oficial
  service.setAutoDispatchDelayMs(15 * 60 * 1000);

  // 7. ESCENARIO 6: CONTROLADOR REST API
  const pendingCtrl = controller.getPendingMessages();
  if (!pendingCtrl.success || typeof pendingCtrl.pendingCount !== 'number') {
    return { name: 'CopilotController GET /copilot/pending', passed: false, details: 'Endpoint /copilot/pending devolvió formato inválido' };
  }

  const statsCtrl = controller.getStats();
  if (!statsCtrl.success || statsCtrl.stats.approvedByHumanCount < 2 || statsCtrl.stats.autoDispatchedCount < 1) {
    return { name: 'CopilotController GET /copilot/stats', passed: false, details: 'Estadísticas del copiloto humano inconsistentes' };
  }

  return {
    name: 'Human Copilot & 15-Minute Auto-Dispatch Suite',
    passed: true,
    details: 'Control humano prioritario, aprobación/edición de sugerencias IA, envío manual y auto-despacho de rescate tras 15m validados al 100%.'
  };
}

import { QueueService } from '../../src/core/queue.service';
import { StateMachineService } from '../../src/core/state-machine.service';
import { KaizenMonitorService } from '../../src/core/kaizen-monitor.service';
import { PipelineStage } from '../../src/crm/dto/create-lead.dto';

export async function testCoreServicesSuite(): Promise<{ name: string; passed: boolean; details: string }> {
  // 1. QueueService Tests
  const queue = new QueueService();
  const uId = 'user_cadence_01';
  const ch = 'facebook_marketplace';

  // Buffer de ráfagas
  queue.addMessageToBuffer(uId, ch, 'Mensaje 1: Hola');
  queue.addMessageToBuffer(uId, ch, 'Mensaje 2: ¿Precio?');
  const consolidated = queue.popConsolidatedBuffer(uId, ch);
  if (consolidated !== 'Mensaje 1: Hola\nMensaje 2: ¿Precio?') {
    return { name: 'QueueService Burst Buffer Consolidation', passed: false, details: 'Consolidación de ráfagas errónea' };
  }
  // Buffer debe quedar vacío tras pop
  if (queue.popConsolidatedBuffer(uId, ch) !== '') {
    return { name: 'QueueService Buffer Clear', passed: false, details: 'Buffer no se limpió tras extracción' };
  }

  // Cadencia 1: Primer mensaje -> ready
  const cad1 = queue.evaluateCadence(uId, ch);
  if (!cad1.canProcessImmediately || cad1.reason !== 'ready') {
    return { name: 'QueueService First Message Cadence', passed: false, details: 'Primer mensaje debió ser ready' };
  }

  // Registrar respuesta despachada
  queue.recordReplyDispatched(uId, ch);

  // Cadencia 2: Segundo mensaje inmediato -> cooldown_15m
  const cad2 = queue.evaluateCadence(uId, ch);
  if (cad2.canProcessImmediately || cad2.reason !== 'cooldown_15m' || cad2.waitMs <= 0) {
    return { name: 'QueueService Cooldown 15m Cadence', passed: false, details: 'Segundo mensaje debió activar cooldown_15m' };
  }

  // Simular 3 respuestas más (total 4)
  queue.recordReplyDispatched(uId, ch);
  queue.recordReplyDispatched(uId, ch);
  queue.recordReplyDispatched(uId, ch);

  // Cadencia 3: Quinto mensaje -> max_4_per_hour_exceeded
  const cad3 = queue.evaluateCadence(uId, ch);
  if (cad3.reason !== 'max_4_per_hour_exceeded') {
    return { name: 'QueueService Max 4 per Hour Cadence', passed: false, details: `Esperado max_4_per_hour_exceeded, obtenido ${cad3.reason}` };
  }

  // Reset de ventana horaria (simular que transcurrió > 1 hora)
  const session = queue.getOrCreateSession(uId, ch);
  session.hourWindowStart = Date.now() - (61 * 60 * 1000);
  const sessionReset = queue.getOrCreateSession(uId, ch);
  if (sessionReset.repliesThisHour !== 0) {
    return { name: 'QueueService Hour Window Reset', passed: false, details: 'Ventana deslizante de 1 hora no reseteó contador' };
  }

  // 2. StateMachineService Tests
  const stateMachine = new StateMachineService();

  // Detección de Human Takeover
  if (!stateMachine.isHumanTakeoverRequested('quiero hablar con un asesor real y humano')) {
    return { name: 'StateMachine Human Trigger: Asesor real', passed: false, details: 'Fallo al detectar gatillo humano' };
  }
  if (!stateMachine.isHumanTakeoverRequested('dame una rebaja ya o precio minimo')) {
    return { name: 'StateMachine Human Trigger: Rebaja ya', passed: false, details: 'Fallo al detectar regateo agresivo' };
  }
  if (stateMachine.isHumanTakeoverRequested('¿en qué horario abren en Tunja?')) {
    return { name: 'StateMachine False Positive Human Trigger', passed: false, details: 'Falso positivo en detección de asesor humano' };
  }

  // Transiciones de Etapas
  const stageHuman = stateMachine.determineNextStage(PipelineStage.PROSPECT, 'quiero un humano', 20);
  if (stageHuman !== PipelineStage.HUMAN_TAKEOVER) {
    return { name: 'StateMachine Transition to HUMAN_TAKEOVER', passed: false, details: 'No transitó a HUMAN_TAKEOVER' };
  }

  const stageQual = stateMachine.determineNextStage(PipelineStage.PROSPECT, 'me interesa con credito', 30);
  if (stageQual !== PipelineStage.QUALIFIED) {
    return { name: 'StateMachine Transition to QUALIFIED', passed: false, details: 'No transitó a QUALIFIED con palabra crédito' };
  }

  const stageProp = stateMachine.determineNextStage(PipelineStage.QUALIFIED, '¿cuanto es el precio y garantia?', 50);
  if (stageProp !== PipelineStage.PROPOSAL_SENT) {
    return { name: 'StateMachine Transition to PROPOSAL_SENT', passed: false, details: 'No transitó a PROPOSAL_SENT con precio' };
  }

  const stagePay = stateMachine.determineNextStage(PipelineStage.PROPOSAL_SENT, 'quiero separar con reserva', 70);
  if (stagePay !== PipelineStage.PAYMENT_PENDING) {
    return { name: 'StateMachine Transition to PAYMENT_PENDING', passed: false, details: 'No transitó a PAYMENT_PENDING con separar' };
  }

  // 3. KaizenMonitorService Tests
  const kaizen = new KaizenMonitorService();
  // Estado inicial limpio
  const initMetrics = kaizen.getMetrics();
  if (initMetrics.kaizenScore !== 100 || initMetrics.status !== 'EXCELLENT') {
    return { name: 'KaizenMonitor Initial Score', passed: false, details: 'Puntaje Kaizen inicial debe ser 100 EXCELLENT' };
  }

  // Registrar interacciones exitosas
  kaizen.recordInteraction(true, 1200);
  kaizen.recordInteraction(true, 1800);
  const goodMetrics = kaizen.getMetrics();
  if (goodMetrics.totalSuccess !== 2 || goodMetrics.successRate !== 100) {
    return { name: 'KaizenMonitor Success Recording', passed: false, details: 'Métricas de éxito erróneas' };
  }

  // Registrar múltiples fallos para probar degradación de status
  for (let i = 0; i < 15; i++) {
    kaizen.recordInteraction(false, 15000);
  }
  const degradedMetrics = kaizen.getMetrics();
  if (degradedMetrics.status !== 'NEEDS_IMPROVEMENT' || degradedMetrics.kaizenScore >= 70) {
    return { name: 'KaizenMonitor Status Degradation', passed: false, details: 'El status Kaizen debió degradarse a NEEDS_IMPROVEMENT ante fallos masivos' };
  }

  // 4. KaizenController Tests
  const { KaizenController } = await import('../../src/core/kaizen.controller');
  const mockRegistry: any = { getAllAdapters: () => [{ name: 'facebook_marketplace', isHealthy: () => true }] };
  const mockSSOT: any = { getAllCars: () => [{ id: '1' }], getDealershipMeta: () => ({ name: 'BuyaCar Tunja' }) };
  const mockCRM: any = { getAllLeads: () => [], getPipelineSummary: () => ({ PROSPECT: { count: 0, avgScore: 0, leads: [] } }) };
  const kaizenCtrl = new KaizenController(kaizen, mockRegistry, mockSSOT, mockCRM);

  const metricsDto = kaizenCtrl.getMetrics();
  if (typeof metricsDto.kaizenScore !== 'number') {
    return { name: 'KaizenController getMetrics', passed: false, details: 'Formato de métricas inválido' };
  }

  const statusDto = await kaizenCtrl.getStatus();
  if (statusDto.system !== 'BuyaCar Multi-Channel Automation Core' || statusDto.channels.length !== 1) {
    return { name: 'KaizenController getStatus', passed: false, details: 'Formato de status de sistema inválido' };
  }

  const html = kaizenCtrl.getDashboard();
  if (!html.includes('BuyaCar') || !html.includes('Panel Kaizen')) {
    return { name: 'KaizenController getDashboard HTML', passed: false, details: 'Dashboard HTML incompleto o no generado' };
  }

  return {
    name: 'Queue Cadence, State Machine & Kaizen Monitor Suite',
    passed: true,
    details: 'Buffer de ráfagas, cadencia de 15m/4h, matriz de embudo, disparadores humanos y algoritmo Kaizen validados al 100%.'
  };
}

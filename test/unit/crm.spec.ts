import { CRMService } from '../../src/crm/crm.service';
import { CRMController } from '../../src/crm/crm.controller';
import { PipelineStage } from '../../src/crm/dto/create-lead.dto';
import { NotFoundException } from '@nestjs/common';

export async function testCRMSuite(): Promise<{ name: string; passed: boolean; details: string }> {
  const crmService = new CRMService();
  const crmController = new CRMController(crmService);

  // 1. getOrCreateLead y obtención
  let lead1: any = crmService.getOrCreateLead({
    chatId: 'user_101',
    channel: 'facebook_marketplace',
    customerName: 'Andrés López',
    vehicleInterestId: 'CAR-101'
  });

  if (lead1.stage !== PipelineStage.PROSPECT || lead1.score !== 15) {
    return { name: 'CRM getOrCreateLead Defaults', passed: false, details: 'Valores por defecto de lead incorrectos' };
  }

  // Idempotencia: el mismo lead no se duplica
  const lead1Same = crmService.getOrCreateLead({ chatId: 'user_101', channel: 'facebook_marketplace' });
  if (lead1 !== lead1Same || crmService.getAllLeads().length !== 1) {
    return { name: 'CRM Idempotency Check', passed: false, details: 'getOrCreateLead duplicó un lead existente' };
  }

  // 2. Validación de CADA regla de Lead Scoring
  const initial = lead1.score; // 15
  crmService.processMessageScoring(lead1, '¿Cuál es el precio?'); // +10 = 25
  if (lead1.score !== initial + 10) {
    return { name: 'CRM Scoring: Precio', passed: false, details: `Esperado ${initial + 10}, obtenido ${lead1.score}` };
  }

  crmService.processMessageScoring(lead1, 'Quiero comprar este auto'); // +15 = 40
  if (lead1.score !== initial + 25) {
    return { name: 'CRM Scoring: Comprar', passed: false, details: `Esperado ${initial + 25}, obtenido ${lead1.score}` };
  }

  crmService.processMessageScoring(lead1, '¿Tienen opciones de credito bancario?'); // +20 = 60
  if (lead1.score !== initial + 45) {
    return { name: 'CRM Scoring: Crédito', passed: false, details: `Esperado ${initial + 45}, obtenido ${lead1.score}` };
  }

  crmService.processMessageScoring(lead1, 'Tengo un vehiculo para retoma o permuta'); // +15 = 75 -> Auto transición a QUALIFIED
  if (lead1.score !== initial + 60 || lead1.stage !== PipelineStage.QUALIFIED) {
    return { name: 'CRM Scoring: Retoma y Auto-Qualify', passed: false, details: `Score ${lead1.score}, Etapa ${lead1.stage}` };
  }

  crmService.processMessageScoring(lead1, 'Deseo hacer visita a la sede de Tunja'); // +20 = 95 -> Auto transición a PROPOSAL_SENT
  if (lead1.score !== initial + 80 || lead1.stage !== PipelineStage.PROPOSAL_SENT) {
    return { name: 'CRM Scoring: Visita Tunja y Auto-Proposal', passed: false, details: `Score ${lead1.score}, Etapa ${lead1.stage}` };
  }

  crmService.processMessageScoring(lead1, 'Quiero separar el auto con transferencia'); // +30 = 100 (tope max) -> Auto a PAYMENT_PENDING
  if (lead1.score !== 100 || lead1.stage !== PipelineStage.PAYMENT_PENDING) {
    return { name: 'CRM Scoring: Separar/Pago y Tope 100', passed: false, details: `Score ${lead1.score}, Etapa ${lead1.stage}` };
  }

  // 3. updateStage manual con notas
  const updated = crmService.updateStage('user_101', 'facebook_marketplace', PipelineStage.CLOSED_WON, 'Venta cerrada con éxito');
  if (!updated || updated.stage !== PipelineStage.CLOSED_WON || updated.notes.length < 2) {
    return { name: 'CRM updateStage Manual', passed: false, details: 'Fallo al actualizar etapa manual o notas' };
  }

  const notFoundUpdate = crmService.updateStage('non_existent', 'whatsapp', PipelineStage.CLOSED_LOST);
  if (notFoundUpdate !== undefined) {
    return { name: 'CRM updateStage Non-Existent', passed: false, details: 'updateStage debió retornar undefined' };
  }

  // 4. getPipelineSummary
  const summary = crmService.getPipelineSummary();
  if (summary.CLOSED_WON.count !== 1 || summary.CLOSED_WON.avgScore !== 100 || summary.PROSPECT.count !== 0) {
    return { name: 'CRM Pipeline Summary Totals', passed: false, details: 'Resumen del pipeline con conteos erróneos' };
  }

  // 5. CRMController REST Endpoints
  const resPipeline = crmController.getPipeline();
  if (!resPipeline.success || !resPipeline.data.CLOSED_WON) {
    return { name: 'CRMController GET /crm/pipeline', passed: false, details: 'Endpoint /crm/pipeline no respondió correctamente' };
  }

  const resLeadsAll = crmController.getLeads();
  if (!resLeadsAll.success || resLeadsAll.total !== 1) {
    return { name: 'CRMController GET /crm/leads', passed: false, details: 'Endpoint /crm/leads no devolvió la lista completa' };
  }

  const resLeadsFilter = crmController.getLeads('whatsapp');
  if (resLeadsFilter.total !== 0) {
    return { name: 'CRMController GET /crm/leads Filter', passed: false, details: 'Filtro por canal en /crm/leads no funcionó' };
  }

  const resPatch = crmController.updateLeadStage('user_101', 'facebook_marketplace', {
    stage: PipelineStage.CLOSED_WON,
    notes: 'Confirmado por finanzas'
  });
  if (!resPatch.success) {
    return { name: 'CRMController PATCH stage', passed: false, details: 'Endpoint PATCH stage falló' };
  }

  let caughtNotFound = false;
  try {
    crmController.updateLeadStage('ghost_user', 'whatsapp', { stage: PipelineStage.CLOSED_LOST });
  } catch (err) {
    caughtNotFound = err instanceof NotFoundException;
  }

  if (!caughtNotFound) {
    return { name: 'CRMController NotFoundException Check', passed: false, details: 'No se lanzó NotFoundException para ID fantasma' };
  }

  // 6. Validación de Historial Conversacional Multi-Turno
  crmService.appendConversationTurn('facebook_marketplace', 'user_101', 'user', '¿Tienen la CX-5?');
  crmService.appendConversationTurn('facebook_marketplace', 'user_101', 'assistant', 'Sí, en Tunja.');
  crmService.appendConversationTurn('facebook_marketplace', 'user_101', 'user', '¿Y qué kilometraje tiene?');
  const history = crmService.getRecentHistoryForAI('facebook_marketplace', 'user_101', 5);
  if (history.length !== 3 || history[2].content !== '¿Y qué kilometraje tiene?') {
    return { name: 'CRM Multi-Turn Conversation History', passed: false, details: 'Historial conversacional multi-turno incorrecto' };
  }

  return {
    name: 'CRM Module, Scoring Engine & REST Controller Suite',
    passed: true,
    details: 'Lead Scoring de 7 reglas, progresión automática, agregación de pipeline y controlador REST validados al 100%.'
  };
}

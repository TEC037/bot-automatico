import { CRMService } from '../src/crm/crm.service';
import { PipelineStage } from '../src/crm/dto/create-lead.dto';

export async function testCRMPipeline(): Promise<{ name: string; passed: boolean; details: string }> {
  const crm = new CRMService();

  // 1. Crear lead
  const lead = crm.getOrCreateLead({
    chatId: 'user_test_fb_001',
    channel: 'facebook_marketplace',
    customerName: 'Juan Pérez'
  });

  if (lead.stage !== PipelineStage.PROSPECT) {
    return {
      name: 'CRM Initial Stage',
      passed: false,
      details: `Etapa inicial esperada PROSPECT, obtenida: ${lead.stage}`
    };
  }

  // 2. Procesar Lead Scoring con intención de compra y financiación
  const initialScore = lead.score;
  const scoreAfterInquiry = crm.processMessageScoring(lead, 'Hola, me interesa saber el precio y opciones de credito para la Mazda CX-5');

  if (scoreAfterInquiry <= initialScore) {
    return {
      name: 'CRM Lead Scoring Increment',
      passed: false,
      details: `El puntaje de lead debió subir con palabras clave de crédito y precio`
    };
  }

  // 3. Probar alta intención de reserva y cierre
  crm.processMessageScoring(lead, 'Quiero separar el auto hoy mismo con transferencia bancaria en la sede de Tunja');
  const updatedLead = crm.getLead('facebook_marketplace', 'user_test_fb_001')!;
  if ((updatedLead.stage as any) !== PipelineStage.PAYMENT_PENDING) {
    return {
      name: 'CRM Stage Auto-Transition to PAYMENT_PENDING',
      passed: false,
      details: `Etapa esperada PAYMENT_PENDING tras intención de separación, obtenida: ${updatedLead.stage}`
    };
  }

  // 4. Verificar resumen de pipeline
  const summary = crm.getPipelineSummary();
  if (summary.PAYMENT_PENDING.count !== 1) {
    return {
      name: 'CRM Pipeline Summary Aggregation',
      passed: false,
      details: `Resumen de pipeline no reflejó el lead en PAYMENT_PENDING`
    };
  }

  return {
    name: 'CRM Pipeline & Lead Scoring Suite',
    passed: true,
    details: `Pipeline y Lead Scoring validados (Puntaje final: ${lead.score}/100, Etapa: ${lead.stage}).`
  };
}

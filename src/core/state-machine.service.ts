import { Injectable, Logger } from '@nestjs/common';
import { PipelineStage } from '../crm/dto/create-lead.dto';

@Injectable()
export class StateMachineService {
  private readonly logger = new Logger(StateMachineService.name);

  private readonly humanTakeoverTriggers = [
    'humano', 'asesor real', 'persona real', 'robot', 'bot',
    'gerente', 'supervisor', 'dueno', 'dueño', 'queja', 'reclamo',
    'demanda', 'estafa', 'descuento ya', 'rebaja ya', 'precio minimo',
    'ultimo precio', 'hablar con alguien', 'abogado'
  ];

  isHumanTakeoverRequested(messageText: string): boolean {
    const lower = messageText.toLowerCase();
    return this.humanTakeoverTriggers.some(t => lower.includes(t));
  }

  determineNextStage(currentStage: PipelineStage, messageText: string, leadScore: number): PipelineStage {
    if (this.isHumanTakeoverRequested(messageText)) {
      this.logger.warn(`Disparador de atención humana activado por mensaje: "${messageText}"`);
      return PipelineStage.HUMAN_TAKEOVER;
    }

    const lower = messageText.toLowerCase();

    // Reglas de transición natural del embudo automotriz
    if (currentStage === PipelineStage.PROSPECT) {
      if (lower.includes('credito') || lower.includes('financ') || lower.includes('retoma') || lower.includes('usado') || leadScore >= 60) {
        return PipelineStage.QUALIFIED;
      }
    }

    if (currentStage === PipelineStage.QUALIFIED) {
      if (lower.includes('precio') || lower.includes('soat') || lower.includes('tecno') || lower.includes('garantia') || leadScore >= 75) {
        return PipelineStage.PROPOSAL_SENT;
      }
    }

    if (currentStage === PipelineStage.PROPOSAL_SENT) {
      if (lower.includes('separar') || lower.includes('reserva') || lower.includes('cuenta') || lower.includes('transferencia') || lower.includes('visita')) {
        return PipelineStage.PAYMENT_PENDING;
      }
    }

    return currentStage;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ChannelRegistryService } from '../channels/channel-registry.service';
import { CRMService } from '../crm/crm.service';
import { QueueService } from '../core/queue.service';
import { KaizenMonitorService } from '../core/kaizen-monitor.service';
import {
  CopilotMode,
  PendingCopilotMessage,
  ApproveCopilotDto,
  SendManualCopilotDto,
  CopilotStats
} from './copilot.interface';

export interface StageSuggestionParams {
  chatId: string;
  channel: string;
  customerName?: string;
  incomingText: string;
  suggestedReply: string;
  vehicleInterestId?: string;
  onDispatched?: (finalText: string, isAuto: boolean) => void;
}

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);
  private mode: CopilotMode = CopilotMode.HUMAN_FIRST;
  private autoDispatchDelayMs: number = 15 * 60 * 1000; // 15 minutos estándar (SLA de atención)
  private pendingMessages: Map<string, PendingCopilotMessage> = new Map();
  private dispatchCallbacks: Map<string, (finalText: string, isAuto: boolean) => void> = new Map();

  private stats = {
    totalReceived: 0,
    approvedByHumanCount: 0,
    autoDispatchedCount: 0,
    discardedCount: 0
  };

  constructor(
    private readonly channelRegistry: ChannelRegistryService,
    private readonly crmService: CRMService,
    private readonly queueService: QueueService,
    private readonly kaizenMonitor: KaizenMonitorService
  ) {}

  setMode(mode: CopilotMode): void {
    this.logger.log(`[Copilot] Modo de operación actualizado a: ${mode}`);
    this.mode = mode;
  }

  getMode(): CopilotMode {
    return this.mode;
  }

  setAutoDispatchDelayMs(ms: number): void {
    this.logger.log(`[Copilot] Temporizador de auto-despacho actualizado a: ${ms}ms (${Math.round(ms / 60000)} min)`);
    this.autoDispatchDelayMs = ms;
  }

  getAutoDispatchDelayMs(): number {
    return this.autoDispatchDelayMs;
  }

  /**
   * Encola una sugerencia de IA para revisión humana.
   * Si en 15 minutos el asesor humano no aprueba, se auto-despacha para no dejar al cliente sin respuesta.
   */
  async stageIncomingSuggestion(params: StageSuggestionParams): Promise<PendingCopilotMessage> {
    const id = `COP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date();
    const autoDispatchAt = new Date(now.getTime() + this.autoDispatchDelayMs);

    this.stats.totalReceived++;

    if (params.onDispatched) {
      this.dispatchCallbacks.set(id, params.onDispatched);
    }

    const messageRecord: PendingCopilotMessage = {
      id,
      chatId: params.chatId,
      channel: params.channel,
      customerName: params.customerName,
      incomingText: params.incomingText,
      suggestedReply: params.suggestedReply,
      vehicleInterestId: params.vehicleInterestId,
      status: 'PENDING',
      createdAt: now,
      autoDispatchAt,
      remainingSeconds: Math.round(this.autoDispatchDelayMs / 1000)
    };

    // Caso 1: Modo FULL_AUTO o delay en 0 (despacho inmediato sin esperar)
    if (this.mode === CopilotMode.FULL_AUTO || this.autoDispatchDelayMs <= 0) {
      await this.executeDispatch(messageRecord, params.suggestedReply, true);
      return messageRecord;
    }

    // Caso 2: Modo HUMAN_FIRST (Opción principal con SLA de 15 minutos)
    if (this.mode === CopilotMode.HUMAN_FIRST) {
      const timer = setTimeout(async () => {
        await this.triggerAutoDispatch(id);
      }, this.autoDispatchDelayMs);

      messageRecord.timerHandle = timer;
      this.pendingMessages.set(id, messageRecord);

      const delayMinutes = Math.round(this.autoDispatchDelayMs / 60000);
      this.logger.log(
        `[Copilot HITL] Sugerencia de IA lista para asesor humano (ID: ${id}) para ${params.customerName || params.chatId}. Auto-despacho en ${delayMinutes} min si no hay intervención.`
      );
    } else {
      // Caso 3: MANUAL_ONLY (Sin temporizador de auto-despacho)
      this.pendingMessages.set(id, messageRecord);
      this.logger.log(`[Copilot MANUAL] Mensaje retenido indefinidamente para control 100% manual.`);
    }

    return messageRecord;
  }

  /**
   * El asesor humano aprueba la sugerencia (o una versión editada por él) y se envía de inmediato.
   */
  async approveMessage(id: string, dto?: ApproveCopilotDto): Promise<{ success: boolean; message: string; dispatchedText?: string }> {
    const record = this.pendingMessages.get(id);
    if (!record) {
      return { success: false, message: `Mensaje de copiloto ${id} no encontrado o ya procesado.` };
    }

    if (record.status !== 'PENDING') {
      return { success: false, message: `El mensaje ${id} ya tiene estado: ${record.status}` };
    }

    // Cancelar el temporizador de los 15 minutos
    if (record.timerHandle) {
      clearTimeout(record.timerHandle);
      record.timerHandle = undefined;
    }

    const textToSend = dto?.editedText?.trim() || record.suggestedReply;
    record.approvedBy = dto?.approvedBy || 'Asesor Comercial Humano (Tunja)';
    
    await this.executeDispatch(record, textToSend, false);
    this.stats.approvedByHumanCount++;

    this.logger.log(
      `[Copilot Aprobado] Asesor humano (${record.approvedBy}) despachó mensaje ID ${id} a [${record.channel}:${record.chatId}].`
    );

    return {
      success: true,
      message: 'Mensaje aprobado y despachado con éxito al cliente.',
      dispatchedText: textToSend
    };
  }

  /**
   * Se ejecuta automáticamente tras 15 minutos sin intervención humana,
   * despachando la sugerencia de IA para evitar que el cliente se sienta abandonado.
   */
  async triggerAutoDispatch(id: string): Promise<boolean> {
    const record = this.pendingMessages.get(id);
    if (!record || record.status !== 'PENDING') {
      return false;
    }

    const minutesWaited = Math.round(this.autoDispatchDelayMs / 60000);
    this.logger.warn(
      `[Copilot Auto-Dispatch] Cumplido el tiempo de espera de ${minutesWaited} minutos sin aprobación humana. Despachando sugerencia automática para cliente [${record.channel}:${record.chatId}].`
    );

    await this.executeDispatch(record, record.suggestedReply, true);
    this.stats.autoDispatchedCount++;
    return true;
  }

  /**
   * Descarta una sugerencia de la IA sin enviarla al cliente.
   */
  discardMessage(id: string): boolean {
    const record = this.pendingMessages.get(id);
    if (!record || record.status !== 'PENDING') return false;

    if (record.timerHandle) {
      clearTimeout(record.timerHandle);
      record.timerHandle = undefined;
    }

    record.status = 'DISCARDED';
    this.stats.discardedCount++;
    this.pendingMessages.delete(id);
    this.dispatchCallbacks.delete(id);

    this.logger.log(`[Copilot Descarte] Sugerencia ${id} descartada por el operador.`);
    return true;
  }

  /**
   * Permite al asesor humano enviar un mensaje directo y personalizado al cliente,
   * cancelando cualquier sugerencia pendiente que estuviera esperando en cola.
   */
  async sendManualMessage(dto: SendManualCopilotDto): Promise<boolean> {
    const adapter = this.channelRegistry.getAdapter(dto.channel);
    if (!adapter) {
      this.logger.error(`Canal ${dto.channel} no encontrado para envío manual.`);
      return false;
    }

    // Cancelar cualquier mensaje pendiente en cola para este cliente
    for (const [id, rec] of this.pendingMessages.entries()) {
      if (rec.chatId === dto.chatId && rec.channel === dto.channel && rec.status === 'PENDING') {
        if (rec.timerHandle) clearTimeout(rec.timerHandle);
        rec.status = 'DISCARDED';
        this.pendingMessages.delete(id);
        this.dispatchCallbacks.delete(id);
      }
    }

    const success = await adapter.sendMessage(dto.chatId, dto.text);
    if (success) {
      this.crmService.appendConversationTurn(dto.channel, dto.chatId, 'assistant', dto.text);
      this.queueService.recordReplyDispatched(dto.chatId, dto.channel);
      this.kaizenMonitor.recordInteraction(true, 100);
      this.logger.log(`[Copilot Manual] Asesor humano envió mensaje directo a [${dto.channel}:${dto.chatId}].`);
    }

    return success;
  }

  /**
   * Retorna la lista de sugerencias pendientes con el tiempo restante calculado en segundos.
   */
  getPendingMessages(): PendingCopilotMessage[] {
    const now = Date.now();
    const result: PendingCopilotMessage[] = [];

    for (const msg of this.pendingMessages.values()) {
      if (msg.status === 'PENDING') {
        msg.remainingSeconds = Math.max(0, Math.round((msg.autoDispatchAt.getTime() - now) / 1000));
        result.push(msg);
      }
    }

    return result.sort((a, b) => a.autoDispatchAt.getTime() - b.autoDispatchAt.getTime());
  }

  getStats(): CopilotStats {
    const pendingList = this.getPendingMessages();
    return {
      mode: this.mode,
      autoDispatchDelayMinutes: Math.round(this.autoDispatchDelayMs / 60000),
      totalReceived: this.stats.totalReceived,
      pendingCount: pendingList.length,
      approvedByHumanCount: this.stats.approvedByHumanCount,
      autoDispatchedCount: this.stats.autoDispatchedCount,
      discardedCount: this.stats.discardedCount
    };
  }

  private async executeDispatch(record: PendingCopilotMessage, textToSend: string, isAuto: boolean): Promise<boolean> {
    const adapter = this.channelRegistry.getAdapter(record.channel);
    if (!adapter) {
      this.logger.error(`Adaptador no encontrado para canal ${record.channel}`);
      return false;
    }

    const success = await adapter.sendMessage(record.chatId, textToSend);

    record.finalDispatchedText = textToSend;
    record.dispatchedAt = new Date();
    record.status = isAuto ? 'AUTO_DISPATCHED_15M' : 'APPROVED_BY_HUMAN';

    // Invocar callback de orquestación si existe
    const callback = this.dispatchCallbacks.get(record.id);
    if (callback) {
      callback(textToSend, isAuto);
      this.dispatchCallbacks.delete(record.id);
    } else {
      // Registrar directamente en CRM, Queue y Kaizen
      this.crmService.appendConversationTurn(record.channel, record.chatId, 'assistant', textToSend);
      this.queueService.recordReplyDispatched(record.chatId, record.channel);
      this.kaizenMonitor.recordInteraction(success, 250);
    }

    this.pendingMessages.delete(record.id);
    return success;
  }
}

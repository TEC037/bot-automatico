import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ChannelRegistryService } from '../channels/channel-registry.service';
import { FBMarketplaceAdapter } from '../channels/facebook/fb-marketplace.adapter';
import { WhatsAppAdapter } from '../channels/whatsapp/whatsapp.adapter';
import { InstagramAdapter } from '../channels/instagram/instagram.adapter';
import { TikTokAdapter } from '../channels/tiktok/tiktok.adapter';
import { QueueService } from './queue.service';
import { StateMachineService } from './state-machine.service';
import { KaizenMonitorService } from './kaizen-monitor.service';
import { CRMService } from '../crm/crm.service';
import { AIOrchestratorService } from '../ai/ai-orchestrator.service';
import { ChatMessage } from '../ai/ai.interface';
import { FunnelPromptBuilder, FunnelStageType } from '../ai/funnel-prompt-builder.service';
import { IncomingChatMessage } from '../channels/channel.interface';
import { SSOTCatalogService } from '../ssot/ssot-catalog.service';
import { AppointmentService } from '../appointments/appointment.service';
import { SanitizerGuardrailService } from '../security/sanitizer-guardrail.service';
import { CopilotService } from '../copilot/copilot.service';
import { PipelineStage } from '../crm/dto/create-lead.dto';

@Injectable()
export class CoreOrchestratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CoreOrchestratorService.name);
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly aptService: AppointmentService;
  private readonly sanitizerService: SanitizerGuardrailService;
  private readonly copilotService: CopilotService;

  constructor(
    private readonly channelRegistry: ChannelRegistryService,
    private readonly fbAdapter: FBMarketplaceAdapter,
    private readonly waAdapter: WhatsAppAdapter,
    private readonly igAdapter: InstagramAdapter,
    private readonly ttAdapter: TikTokAdapter,
    private readonly queueService: QueueService,
    private readonly stateMachine: StateMachineService,
    private readonly kaizenMonitor: KaizenMonitorService,
    private readonly crmService: CRMService,
    private readonly aiOrchestrator: AIOrchestratorService,
    private readonly funnelPromptBuilder: FunnelPromptBuilder,
    private readonly ssotCatalog: SSOTCatalogService,
    appointmentService?: AppointmentService,
    sanitizerService?: SanitizerGuardrailService,
    copilotService?: CopilotService
  ) {
    this.aptService = appointmentService || new AppointmentService(this.ssotCatalog);
    this.sanitizerService = sanitizerService || new SanitizerGuardrailService(this.ssotCatalog);
    this.copilotService = copilotService || new CopilotService(
      this.channelRegistry,
      this.crmService,
      this.queueService,
      this.kaizenMonitor
    );
  }

  getCopilotService(): CopilotService {
    return this.copilotService;
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Iniciando CoreOrchestratorService de BuyaCar Colombia...');

    // Registrar los 4 adaptadores multicanal en el registro dinámico
    this.channelRegistry.registerAdapter(this.fbAdapter);
    this.channelRegistry.registerAdapter(this.waAdapter);
    this.channelRegistry.registerAdapter(this.igAdapter);
    this.channelRegistry.registerAdapter(this.ttAdapter);

    // Conectar el despachador de eventos a cada adaptador
    for (const adapter of this.channelRegistry.getAllAdapters()) {
      adapter.onMessage(async (msg: IncomingChatMessage) => {
        await this.handleIncomingMessage(msg);
      });
    }

    // Inicializar los adaptadores de canal
    this.logger.log('Inicializando todos los canales registrados...');
    await this.channelRegistry.initializeAll();
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Deteniendo CoreOrchestratorService y adaptadores...');
    await this.channelRegistry.shutdownAll();
  }

  async handleIncomingMessage(msg: IncomingChatMessage): Promise<void> {
    const startTime = Date.now();
    this.logger.log(`[Mensaje Entrante] [${msg.channel}] De: ${msg.senderName || msg.senderId} -> "${msg.text}"`);

    // 0. Sanitización de entrada y detección de amenazas adversariales
    const sanitization = this.sanitizerService.sanitizeInput(msg.text);
    const sanitizedText = sanitization.sanitizedText;

    // Si se detecta un intento de trampa / ataque (jailbreak, robo de prompt, manipulación fraudulenta)
    if (sanitization.isBlocked || sanitization.threatDetected) {
      this.logger.warn(`[Shield Alert] Amenaza adversarial detectada de [${msg.channel}:${msg.senderId}]: [${sanitization.threatCategory}] - ${sanitization.threatReason}`);

      const lead = this.crmService.getOrCreateLead({
        chatId: msg.senderId,
        channel: msg.channel,
        customerName: msg.senderName
      });
      lead.notes.push(`SECURITY_THREAT_BLOCKED: ${sanitization.threatCategory}`);
      this.crmService.appendConversationTurn(msg.channel, msg.senderId, 'user', sanitizedText);

      // Responder inmediatamente con escudo de protección sin invocar LLM (costo $0 y cero riesgo)
      const shieldReply = this.sanitizerService.getShieldResponse(sanitization.threatCategory || 'DEFENSE', lead.vehicleInterestId);
      const adapter = this.channelRegistry.getAdapter(msg.channel);
      if (adapter) {
        await adapter.sendMessage(msg.senderId, shieldReply);
        this.crmService.appendConversationTurn(msg.channel, msg.senderId, 'assistant', shieldReply);
      }
      this.kaizenMonitor.recordInteraction(true, Date.now() - startTime);
      return;
    }

    // 1. Obtener o crear Lead en CRM
    const lead = this.crmService.getOrCreateLead({
      chatId: msg.senderId,
      channel: msg.channel,
      customerName: msg.senderName
    });

    // Detección dinámica y ponderada de vehículo de interés desde el inventario SSOT
    const cars = this.ssotCatalog.getAllCars();
    const lowerText = sanitizedText.toLowerCase();
    let bestCar: any = null;
    let highestScore = 0;

    for (const car of cars) {
      let carScore = 0;
      const modelParts = car.name.toLowerCase().split(' ').filter(w => w.length >= 3 && w !== 'grand' && w !== 'touring' && w !== 'intens');
      const isBrandMatch = lowerText.includes(car.brand.toLowerCase());
      
      if (isBrandMatch) carScore += 20;
      for (const part of modelParts) {
        if (lowerText.includes(part)) {
          carScore += 50;
        }
      }

      if (carScore > highestScore) {
        highestScore = carScore;
        bestCar = car;
      }
    }

    if (bestCar && highestScore >= 50) {
      if (lead.vehicleInterestId !== bestCar.id) {
        lead.vehicleInterestId = bestCar.id;
        this.logger.log(`[Lead Pivot] Vehículo de interés de [${msg.senderId}] actualizado a: ${bestCar.name} (${bestCar.id}) con score ${highestScore}`);
      }
    }

    // 2. Procesar Lead Scoring en tiempo real y registrar turno de conversación
    const newScore = this.crmService.processMessageScoring(lead, sanitizedText);
    this.crmService.appendConversationTurn(msg.channel, msg.senderId, 'user', sanitizedText);
    this.logger.debug(`Lead [${msg.senderId}] Puntaje actualizado: ${newScore}/100`);

    // 3. Evaluar máquina de estados del embudo y escalamiento humano
    const nextStage = this.stateMachine.determineNextStage(lead.stage, sanitizedText, newScore);
    if (nextStage !== lead.stage) {
      this.crmService.updateStage(msg.senderId, msg.channel, nextStage);
    }

    // Si requiere atención humana, notificar de inmediato
    if (nextStage === 'HUMAN_TAKEOVER') {
      const meta = this.ssotCatalog.getDealershipMeta();
      const adapter = this.channelRegistry.getAdapter(msg.channel);
      if (adapter) {
        await adapter.sendMessage(
          msg.senderId,
          `Con mucho gusto te conecto directamente con nuestro Gerente Comercial en Tunja para atender tu requerimiento: ${meta.whatsapp}`
        );
      }
      return;
    }

    // 4. Agregar mensaje al buffer de consolidación de ráfagas
    this.queueService.addMessageToBuffer(msg.senderId, msg.channel, sanitizedText);

    // 5. Evaluar cadencia y rate limit (15 min cooldown, máx 4/hora)
    const cadence = this.queueService.evaluateCadence(msg.senderId, msg.channel);
    const timerKey = `${msg.channel}:${msg.senderId}`;

    if (cadence.canProcessImmediately) {
      // Breve debounce de 4 segundos para consolidar ráfagas de tipeo
      if (this.debounceTimers.has(timerKey)) {
        clearTimeout(this.debounceTimers.get(timerKey));
      }

      const timer = setTimeout(async () => {
        this.debounceTimers.delete(timerKey);
        await this.processConsolidatedInquiry(msg.senderId, msg.channel, startTime);
      }, 4000);

      this.debounceTimers.set(timerKey, timer);
    } else if (cadence.reason === 'cooldown_15m') {
      this.logger.log(`[Rate Limit] Cooldown activo para ${msg.senderId}. Respuesta programada en ${Math.round(cadence.waitMs / 60000)} min.`);
      if (!this.debounceTimers.has(timerKey)) {
        const timer = setTimeout(async () => {
          this.debounceTimers.delete(timerKey);
          await this.processConsolidatedInquiry(msg.senderId, msg.channel, startTime);
        }, cadence.waitMs);
        this.debounceTimers.set(timerKey, timer);
      }
    } else if (cadence.reason === 'max_4_per_hour_exceeded') {
      this.logger.warn(`[Anti-Abuso] Usuario ${msg.senderId} alcanzó el tope de 4 respuestas por hora. Esperando reset de ventana horaria.`);
    }
  }

  private async processConsolidatedInquiry(userId: string, channel: string, startTime: number): Promise<void> {
    const consolidatedText = this.queueService.popConsolidatedBuffer(userId, channel);
    if (!consolidatedText) return;

    const lead = this.crmService.getLead(channel, userId);
    const adapter = this.channelRegistry.getAdapter(channel);

    if (!adapter) {
      this.logger.error(`Adaptador no encontrado para canal: ${channel}`);
      return;
    }

    try {
      // 1. Detección y gestión garantizada de agendamiento de citas sin cruces
      const aptIntent = this.aptService.parseAppointmentIntent(consolidatedText);
      let replyContent = '';
      let usedProvider = 'appointment-engine';

      let confirmedAppointmentId: string | undefined = undefined;

      if (aptIntent.hasIntent && aptIntent.timeSlot && aptIntent.date) {
        const booking = this.aptService.bookAppointment({
          chatId: userId,
          channel,
          customerName: lead?.customerName,
          vehicleId: lead?.vehicleInterestId || 'CAR-101',
          date: aptIntent.date,
          timeSlot: aptIntent.timeSlot
        });

        const car = this.ssotCatalog.findById(lead?.vehicleInterestId || 'CAR-101');
        const meta = this.ssotCatalog.getDealershipMeta();

        if (booking.success && booking.appointment) {
          confirmedAppointmentId = booking.appointment.id;
          this.crmService.updateStage(userId, channel, PipelineStage.APPOINTMENT_SCHEDULED);
          replyContent = `¡Confirmado! Tu cita para ver la ${car?.name || 'camioneta'} quedó agendada para el ${aptIntent.date} a las ${aptIntent.timeSlot} en nuestra sala de Tunja (${meta.address}). Te esperamos sin cruces. WhatsApp directo: ${meta.whatsapp}`;
        } else {
          // Prevención estricta de cruce
          const alts = booking.availableAlternatives && booking.availableAlternatives.length > 0
            ? `Tenemos libre a las ${booking.availableAlternatives.join(' o a las ')}`
            : 'Por favor indícanos otra fecha u horario';
          replyContent = `El horario de las ${aptIntent.timeSlot} ya se encuentra reservado para ese vehículo para evitar cruces con otros clientes. ${alts}. ¿Cuál horario prefieres?`;
        }
      } else if (aptIntent.hasIntent && !aptIntent.timeSlot) {
        const targetDate = aptIntent.date || new Date().toISOString().split('T')[0];
        const freeSlots = this.aptService.getAvailableSlots(targetDate, lead?.vehicleInterestId);
        const topSlots = freeSlots.slice(0, 3).join(', ');
        replyContent = `Tenemos turnos disponibles en nuestra sala de Tunja para el ${aptIntent.dayLabel || 'día'} a las ${topSlots}. ¿Cuál horario prefieres para apartar tu cita sin cruces?`;
      } else {
        // Flujo habitual con IA gratuita
        const systemPrompt = this.funnelPromptBuilder.buildPromptForStage(
          (lead?.stage as FunnelStageType) || 'PROSPECT',
          channel,
          lead?.vehicleInterestId
        );
        const existingHistory = this.crmService.getRecentHistoryForAI(channel, userId, 6);
        const history: ChatMessage[] = existingHistory.length > 0
          ? existingHistory
          : [{ role: 'user', content: consolidatedText }];

        const aiResponse = await this.aiOrchestrator.generateResponse(systemPrompt, history);
        replyContent = aiResponse.content;
        usedProvider = aiResponse.provider;
      }

      // 2. Aplicar Guardrail de Salida (Prevenir manipulación de precio, URLs maliciosas, HTML/Scripts y Citas Fantasma)
      const outputGuardrail = this.sanitizerService.sanitizeOutput(replyContent, {
        vehicleId: lead?.vehicleInterestId,
        originalStage: lead?.stage,
        confirmedAppointmentId
      });

      if (outputGuardrail.isModified) {
        this.logger.warn(`[Output Guardrail Alert] Salida corregida por violaciones: ${outputGuardrail.violationsFound.join(' | ')}`);
        replyContent = outputGuardrail.safeOutput;
      }

      // 3. Asegurar llamado a la acción conciso a WhatsApp oficial si no viene incluido
      const meta = this.ssotCatalog.getDealershipMeta();
      if (channel !== 'whatsapp' && !replyContent.includes('wa.me')) {
        replyContent += `\n📲 Escríbenos a WhatsApp: ${meta.whatsapp}`;
      }

      // 4. Encolar en Copiloto Humano (Control Humano Principal con SLA de 15 minutos)
      await this.copilotService.stageIncomingSuggestion({
        chatId: userId,
        channel,
        customerName: lead?.customerName,
        incomingText: consolidatedText,
        suggestedReply: replyContent,
        vehicleInterestId: lead?.vehicleInterestId,
        onDispatched: (finalText, isAuto) => {
          const latencyMs = Date.now() - startTime;
          this.kaizenMonitor.recordInteraction(true, latencyMs);
          this.crmService.appendConversationTurn(channel, userId, 'assistant', finalText);
          this.queueService.recordReplyDispatched(userId, channel);
          this.logger.log(
            `[Core] Mensaje entregado a [${channel}:${userId}] vía [${isAuto ? 'copilot-auto-sla-15m' : 'human-approval'}] (${latencyMs}ms).`
          );
        }
      });
    } catch (err: any) {
      this.logger.error(`Error al procesar consulta consolidada para [${userId}]: ${err.message}`, err.stack);
      this.kaizenMonitor.recordInteraction(false, Date.now() - startTime);
    }
  }
}

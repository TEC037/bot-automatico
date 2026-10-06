import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { CreateLeadDto, PipelineStage } from './dto/create-lead.dto';
import { ChatMessage } from '../ai/ai.interface';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface LeadRecord {
  chatId: string;
  channel: string;
  customerName?: string;
  vehicleInterestId?: string;
  stage: PipelineStage;
  score: number; // 0 a 100
  notes: string[];
  createdAt: Date;
  updatedAt: Date;
  lastMessageText?: string;
  conversationHistory: ChatTurn[];
}

@Injectable()
export class CRMService implements OnModuleInit {
  private readonly logger = new Logger(CRMService.name);
  private leads: Map<string, LeadRecord> = new Map();
  private readonly storagePath = path.resolve(__dirname, '../../data/crm_leads.json');
  private saveTimeout: NodeJS.Timeout | null = null;

  onModuleInit(): void {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        const list: LeadRecord[] = JSON.parse(raw);
        for (const item of list) {
          item.createdAt = new Date(item.createdAt);
          item.updatedAt = new Date(item.updatedAt);
          if (!item.conversationHistory) item.conversationHistory = [];
          this.leads.set(`${item.channel}:${item.chatId}`, item);
        }
        this.logger.log(`CRM restauró ${this.leads.size} leads desde almacenamiento persistente.`);
      }
    } catch (err: any) {
      this.logger.warn(`No se pudieron cargar leads anteriores: ${err.message}`);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      try {
        const dir = path.dirname(this.storagePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const data = JSON.stringify(Array.from(this.leads.values()), null, 2);
        fs.writeFileSync(this.storagePath, data, 'utf-8');
      } catch (err: any) {
        this.logger.error(`Error guardando leads en disco: ${err.message}`);
      }
    }, 1000);
  }

  getOrCreateLead(dto: CreateLeadDto): LeadRecord {
    const key = `${dto.channel}:${dto.chatId}`;
    let lead = this.leads.get(key);

    if (!lead) {
      lead = {
        chatId: dto.chatId,
        channel: dto.channel,
        customerName: dto.customerName || 'Prospecto BuyaCar',
        vehicleInterestId: dto.vehicleInterestId,
        stage: dto.stage || PipelineStage.PROSPECT,
        score: dto.score || 15,
        notes: [`Lead creado desde canal ${dto.channel}`],
        createdAt: new Date(),
        updatedAt: new Date(),
        conversationHistory: []
      };
      this.leads.set(key, lead);
      this.logger.log(`Nuevo lead registrado en CRM: [${key}] con puntaje inicial ${lead.score}`);
      this.scheduleSave();
    }

    return lead;
  }

  getLead(channel: string, chatId: string): LeadRecord | undefined {
    return this.leads.get(`${channel}:${chatId}`);
  }

  getAllLeads(): LeadRecord[] {
    return Array.from(this.leads.values());
  }

  getPipelineSummary(): Record<PipelineStage, { count: number; avgScore: number; leads: LeadRecord[] }> {
    const summary: any = {};
    for (const stage of Object.values(PipelineStage)) {
      summary[stage] = { count: 0, avgScore: 0, leads: [] };
    }

    for (const lead of this.leads.values()) {
      summary[lead.stage].leads.push(lead);
      summary[lead.stage].count += 1;
    }

    for (const stage of Object.values(PipelineStage)) {
      const totalScore = summary[stage].leads.reduce((acc: number, l: LeadRecord) => acc + l.score, 0);
      summary[stage].avgScore = summary[stage].count > 0 ? Math.round(totalScore / summary[stage].count) : 0;
    }

    return summary;
  }

  updateStage(chatId: string, channel: string, stage: PipelineStage, note?: string): LeadRecord | undefined {
    const key = `${channel}:${chatId}`;
    const lead = this.leads.get(key);
    if (!lead) return undefined;

    lead.stage = stage;
    lead.updatedAt = new Date();
    if (note) {
      lead.notes.push(`[${new Date().toISOString()}] ${note}`);
    }
    this.logger.log(`Etapa de lead [${key}] actualizada a: ${stage}`);
    this.scheduleSave();
    return lead;
  }

  /**
   * Agrega un turno de conversación al historial del lead
   */
  appendConversationTurn(channel: string, chatId: string, role: 'user' | 'assistant', content: string): void {
    const lead = this.getLead(channel, chatId);
    if (!lead) return;

    if (!lead.conversationHistory) {
      lead.conversationHistory = [];
    }

    lead.conversationHistory.push({
      role,
      content,
      timestamp: new Date().toISOString()
    });

    // Mantener los últimos 8 turnos (4 idas y vueltas) para economía de contexto
    if (lead.conversationHistory.length > 8) {
      lead.conversationHistory.shift();
    }

    lead.updatedAt = new Date();
    this.scheduleSave();
  }

  /**
   * Obtiene el historial reciente formateado para los proveedores de IA
   */
  getRecentHistoryForAI(channel: string, chatId: string, limit = 6): ChatMessage[] {
    const lead = this.getLead(channel, chatId);
    if (!lead || !lead.conversationHistory) return [];

    return lead.conversationHistory
      .slice(-limit)
      .map(t => ({ role: t.role as 'user' | 'assistant', content: t.content }));
  }

  /**
   * Lead Scoring Automático (0-100) basado en intención de compra comercial
   */
  processMessageScoring(lead: LeadRecord, messageText: string): number {
    const lower = messageText.toLowerCase();
    let pointsToAdd = 0;

    const scoringRules = [
      { words: ['precio', 'costo', 'valor', 'cuanto'], points: 10, note: 'Consulta de precio' },
      { words: ['comprar', 'interesa', 'quiero', 'disponible'], points: 15, note: 'Intención de compra' },
      { words: ['credito', 'financ', 'cuota', 'banco'], points: 20, note: 'Intención de financiación' },
      { words: ['retoma', 'usado', 'permuta', 'cambio'], points: 15, note: 'Vehículo en parte de pago' },
      { words: ['visita', 'sede', 'tunja', 'verlo', 'sabado', 'horario'], points: 20, note: 'Intención de visita física en Tunja' },
      { words: ['separar', 'reserva', 'pago', 'transferencia', 'consignar'], points: 30, note: 'Alta intención de cierre/pago' },
      { words: ['soat', 'tecno', 'kilometraje', 'km', 'peritaje'], points: 10, note: 'Validación técnica' }
    ];

    for (const rule of scoringRules) {
      if (rule.words.some(w => lower.includes(w))) {
        pointsToAdd += rule.points;
      }
    }

    lead.score = Math.min(100, lead.score + pointsToAdd);
    lead.lastMessageText = messageText;
    lead.updatedAt = new Date();

    // Auto-transición en el pipeline según puntaje y palabras
    if (lead.score >= 75 && lead.stage === PipelineStage.PROSPECT) {
      lead.stage = PipelineStage.QUALIFIED;
    }
    if (lead.score >= 90 && (lead.stage === PipelineStage.QUALIFIED || lead.stage === PipelineStage.PROSPECT)) {
      lead.stage = PipelineStage.PROPOSAL_SENT;
    }
    if (lower.includes('separar') || lower.includes('transferencia') || lower.includes('reserva')) {
      lead.stage = PipelineStage.PAYMENT_PENDING;
    }

    this.scheduleSave();
    return lead.score;
  }
}

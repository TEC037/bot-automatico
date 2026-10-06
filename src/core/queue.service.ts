import { Injectable, Logger } from '@nestjs/common';

export interface UserQueueSession {
  userId: string;
  channel: string;
  lastReplyTimestamp: number;
  repliesThisHour: number;
  hourWindowStart: number;
  buffer: string[];
}

export interface QueueDecision {
  canProcessImmediately: boolean;
  waitMs: number;
  reason: 'ready' | 'cooldown_15m' | 'max_4_per_hour_exceeded';
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private sessions: Map<string, UserQueueSession> = new Map();
  private readonly cooldownMs = 15 * 60 * 1000; // 15 minutos en milisegundos
  private readonly maxRepliesPerHour = 4;

  getOrCreateSession(userId: string, channel: string): UserQueueSession {
    const key = `${channel}:${userId}`;
    let session = this.sessions.get(key);
    const now = Date.now();

    if (!session) {
      session = {
        userId,
        channel,
        lastReplyTimestamp: 0,
        repliesThisHour: 0,
        hourWindowStart: now,
        buffer: []
      };
      this.sessions.set(key, session);
    }

    // Reset de ventana deslizante de 1 hora
    if (now - session.hourWindowStart >= 60 * 60 * 1000) {
      session.hourWindowStart = now;
      session.repliesThisHour = 0;
    }

    return session;
  }

  addMessageToBuffer(userId: string, channel: string, text: string): void {
    const session = this.getOrCreateSession(userId, channel);
    session.buffer.push(text);
  }

  popConsolidatedBuffer(userId: string, channel: string): string {
    const session = this.getOrCreateSession(userId, channel);
    const consolidated = session.buffer.join('\n');
    session.buffer = [];
    return consolidated;
  }

  evaluateCadence(userId: string, channel: string): QueueDecision {
    const session = this.getOrCreateSession(userId, channel);
    const now = Date.now();

    // 1. Validar tope horario de 4 comunicaciones por hora
    if (session.repliesThisHour >= this.maxRepliesPerHour) {
      const waitMs = (session.hourWindowStart + 60 * 60 * 1000) - now;
      return {
        canProcessImmediately: false,
        waitMs: Math.max(waitMs, 0),
        reason: 'max_4_per_hour_exceeded'
      };
    }

    // 2. Validar enfriamiento de 15 minutos entre respuestas automáticas
    const timeSinceLast = now - session.lastReplyTimestamp;
    if (session.lastReplyTimestamp > 0 && timeSinceLast < this.cooldownMs) {
      const remaining = this.cooldownMs - timeSinceLast;
      return {
        canProcessImmediately: false,
        waitMs: remaining,
        reason: 'cooldown_15m'
      };
    }

    return {
      canProcessImmediately: true,
      waitMs: 0,
      reason: 'ready'
    };
  }

  recordReplyDispatched(userId: string, channel: string): void {
    const session = this.getOrCreateSession(userId, channel);
    session.lastReplyTimestamp = Date.now();
    session.repliesThisHour += 1;
    this.logger.log(`Respuesta registrada para [${channel}:${userId}]. Total esta hora: ${session.repliesThisHour}/${this.maxRepliesPerHour}`);
  }
}

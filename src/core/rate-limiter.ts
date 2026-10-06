import { UserSession } from '../types';

export interface RateLimitDecision {
  canReplyImmediately: boolean;
  waitMs: number;
  reason: 'allowed' | 'cooldown_active' | 'hourly_limit_exceeded' | 'flagged_human';
}

export class RateLimiterService {
  private readonly cooldownMs: number;
  private readonly maxPerHour: number;
  private sessions: Map<string, UserSession> = new Map();

  constructor(cooldownMinutes = 15, maxRepliesPerHour = 4) {
    this.cooldownMs = cooldownMinutes * 60 * 1000;
    this.maxPerHour = maxRepliesPerHour;
  }

  getOrCreateSession(userId: string, channel: any, senderName?: string): UserSession {
    const key = `${channel}:${userId}`;
    let session = this.sessions.get(key);

    const now = Date.now();
    if (!session) {
      session = {
        userId,
        channel,
        senderName,
        currentStage: 'ETAPA_1_DESCUBRIMIENTO',
        lastReplyTime: 0,
        messagesThisHour: 0,
        hourWindowStart: now,
        messageBuffer: [],
        history: [],
        flaggedHuman: false
      };
      this.sessions.set(key, session);
    }

    // Reset de ventana horaria deslizante (60 minutos)
    if (now - session.hourWindowStart >= 60 * 60 * 1000) {
      session.hourWindowStart = now;
      session.messagesThisHour = 0;
    }

    return session;
  }

  evaluate(session: UserSession): RateLimitDecision {
    if (session.flaggedHuman) {
      return {
        canReplyImmediately: false,
        waitMs: 0,
        reason: 'flagged_human'
      };
    }

    const now = Date.now();

    // 1. Validar límite estricto de máximo 4 comunicaciones por hora
    if (session.messagesThisHour >= this.maxPerHour) {
      const timeUntilHourReset = (session.hourWindowStart + 60 * 60 * 1000) - now;
      return {
        canReplyImmediately: false,
        waitMs: Math.max(timeUntilHourReset, 0),
        reason: 'hourly_limit_exceeded'
      };
    }

    // 2. Validar cadencia de 15 minutos entre respuestas
    const timeSinceLastReply = now - session.lastReplyTime;
    if (session.lastReplyTime > 0 && timeSinceLastReply < this.cooldownMs) {
      const remainingCooldown = this.cooldownMs - timeSinceLastReply;
      return {
        canReplyImmediately: false,
        waitMs: remainingCooldown,
        reason: 'cooldown_active'
      };
    }

    return {
      canReplyImmediately: true,
      waitMs: 0,
      reason: 'allowed'
    };
  }

  recordReplySent(session: UserSession): void {
    const now = Date.now();
    session.lastReplyTime = now;
    session.messagesThisHour += 1;
    session.messageBuffer = []; // Limpia el buffer acumulado
  }

  bufferIncomingMessage(session: UserSession, text: string): void {
    session.messageBuffer.push(text);
  }

  getConsolidatedUserQuery(session: UserSession): string {
    if (session.messageBuffer.length === 0) return '';
    return session.messageBuffer.join('\n');
  }

  flagForHuman(session: UserSession): void {
    session.flaggedHuman = true;
    session.currentStage = 'HUMAN_HANDOVER';
  }
}

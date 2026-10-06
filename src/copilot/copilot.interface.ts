export enum CopilotMode {
  HUMAN_FIRST = 'HUMAN_FIRST',       // Opción principal: Asesor humano primero (15m SLA timeout auto-send)
  FULL_AUTO = 'FULL_AUTO',           // Automatización inmediata (desatendido nocturno / fines de semana)
  MANUAL_ONLY = 'MANUAL_ONLY'        // Control 100% manual sin auto-despacho
}

export type CopilotMessageStatus =
  | 'PENDING'
  | 'APPROVED_BY_HUMAN'
  | 'AUTO_DISPATCHED_15M'
  | 'DISCARDED';

export interface PendingCopilotMessage {
  id: string;
  chatId: string;
  channel: string;
  customerName?: string;
  incomingText: string;
  suggestedReply: string;
  vehicleInterestId?: string;
  status: CopilotMessageStatus;
  createdAt: Date;
  autoDispatchAt: Date;
  remainingSeconds: number;
  timerHandle?: NodeJS.Timeout;
  finalDispatchedText?: string;
  dispatchedAt?: Date;
  approvedBy?: string;
}

export interface ApproveCopilotDto {
  editedText?: string;
  approvedBy?: string;
}

export interface SendManualCopilotDto {
  chatId: string;
  channel: string;
  text: string;
  senderName?: string;
}

export interface CopilotStats {
  mode: CopilotMode;
  autoDispatchDelayMinutes: number;
  totalReceived: number;
  pendingCount: number;
  approvedByHumanCount: number;
  autoDispatchedCount: number;
  discardedCount: number;
}

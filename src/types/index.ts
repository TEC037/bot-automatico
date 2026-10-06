export type ChannelType = 'facebook_marketplace' | 'whatsapp' | 'instagram' | 'web';

export type FunnelStage = 
  | 'ETAPA_1_DESCUBRIMIENTO'
  | 'ETAPA_2_CUALIFICACION'
  | 'ETAPA_3_DETALLE_TECNICO'
  | 'ETAPA_4_CIERRE_WHATSAPP'
  | 'HUMAN_HANDOVER';

export interface IncomingMessage {
  id: string;
  channel: ChannelType;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: Date;
  rawPayload?: any;
}

export interface OutgoingMessage {
  channel: ChannelType;
  recipientId: string;
  text: string;
  delayMs?: number;
}

export interface UserSession {
  userId: string;
  channel: ChannelType;
  senderName?: string;
  currentStage: FunnelStage;
  vehicleInterestId?: string;
  lastReplyTime: number; // timestamp en ms
  messagesThisHour: number;
  hourWindowStart: number; // timestamp en ms
  messageBuffer: string[]; // mensajes acumulados para procesar juntos
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  flaggedHuman: boolean;
}

export interface Vehicle {
  id: string;
  marca: string;
  modelo: string;
  ano: number;
  kilometraje_km: number;
  transmision: string;
  motor: string;
  color: string;
  precio_contado_usd: number;
  precio_financiado_cuota_estimada_usd: number;
  estado: string;
  caracteristicas: string[];
  inspeccion: string;
}

export interface DealershipData {
  concesionario: {
    nombre: string;
    lema: string;
    direccion: string;
    ciudad: string;
    horarios: string;
    whatsapp_oficial: {
      numero: string;
      enlace_directo: string;
      asesor_principal: string;
      beneficio_whatsapp: string;
    };
  };
  politicas_negocio: {
    compra_vehiculos_retoma: {
      aceptan_usados: boolean;
      condicion: string;
      anos_admitidos: string;
      pago_inmediato: string;
    };
    garantia: {
      cobertura: string;
      peritaje: string;
    };
    financiacion: {
      disponible: boolean;
      cuota_inicial_desde: string;
      plazo_meses: string;
      requisito_rapido: string;
    };
  };
  embudo_ventas: {
    etapas: Array<{ id: string; objetivo: string; regla: string }>;
    disparador_humano: {
      condiciones: string[];
      mensaje_transicion: string;
    };
  };
  reglas_comunicacion_cadencia: {
    cooldown_minutos: number;
    max_respuestas_por_hora: number;
    estrategia_agrupacion: string;
    objetivo_canal: string;
  };
  inventario: Vehicle[];
  respuestas_frecuentes: Record<string, string>;
}

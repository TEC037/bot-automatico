export interface IncomingChatMessage {
  id: string;
  channel: string; // 'facebook_marketplace' | 'whatsapp' | 'instagram' | 'tiktok'
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: Date;
  rawPayload?: any;
}

export interface SendMessageOptions {
  delayMs?: number;
  mediaUrl?: string;
  humanize?: boolean;
}

export interface ChannelAdapter {
  readonly name: string;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  sendMessage(recipientId: string, text: string, options?: SendMessageOptions): Promise<boolean>;
  onMessage(handler: (msg: IncomingChatMessage) => Promise<void>): void;
  isHealthy(): boolean;
}

export type IChannelAdapter = ChannelAdapter;
export type IncomingMessage = IncomingChatMessage;

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AIProvider, AIResponse, ChatMessage } from '../ai.interface';

@Injectable()
export class GeminiFreeProvider implements AIProvider {
  readonly name = 'gemini-free' as const;
  private readonly logger = new Logger(GeminiFreeProvider.name);
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async generateReply(systemPrompt: string, history: ChatMessage[]): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY no configurada.');
    }

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history
    ];

    this.logger.debug(`Llamando a Gemini Free (${this.model})...`);

    const res = await axios.post(
      endpoint,
      {
        model: this.model,
        messages,
        temperature: 0.35,
        max_tokens: 400
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 12000
      }
    );

    const reply = res.data?.choices?.[0]?.message?.content?.trim() || '';
    return {
      content: reply,
      provider: 'gemini-free',
      model: this.model,
      tokensEstimated: res.data?.usage?.total_tokens
    };
  }
}
